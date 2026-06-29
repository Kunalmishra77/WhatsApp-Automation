import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

const RATES = { marketing: 0.58, utility: 0.14, auth: 0.14, service: 0.29 };

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  return profile?.is_platform_admin ? db : null;
}

// Fetch conversation analytics from Meta Graph API using WABA ID
async function fetchMetaConversationAnalytics(
  wabaId: string,
  accessToken: string,
  startDate: Date,
  endDate: Date,
): Promise<{ marketing: number; utility: number; auth: number; service: number; raw_cost: number } | null> {
  try {
    const token = accessToken.replace(/﻿/g, '').trim();
    const start = Math.floor(startDate.getTime() / 1000);
    const end   = Math.floor(endDate.getTime() / 1000);

    // Use WABA ID (not phone_number_id) for conversation_analytics
    const params = new URLSearchParams({
      start: String(start),
      end:   String(end),
      granularity: 'MONTHLY',
      conversation_types: '["REGULAR","REFERRAL","FREE_ENTRY","FREE_TIER"]',
      dimensions: '["conversation_type"]',
      access_token: token,
    });

    const url = `https://graph.facebook.com/v19.0/${wabaId}/conversation_analytics?${params}`;
    const res  = await fetch(url);

    if (!res.ok) {
      const err = await res.json() as { error?: { message: string; code: number } };
      console.warn(`[MetaBilling] WABA ${wabaId} analytics error: ${err?.error?.message} (code: ${err?.error?.code})`);
      return null;
    }

    const data = await res.json() as {
      data?: Array<{
        conversation_analytics?: {
          data?: Array<{
            conversation_type: string;
            conversation:      number;
            cost:              number;
          }>;
        };
      }>;
    };

    const rows = data?.data?.[0]?.conversation_analytics?.data ?? [];
    let marketing = 0, utility = 0, auth = 0, service = 0, raw_cost = 0;

    for (const row of rows) {
      const count = row.conversation ?? 0;
      const cost  = row.cost ?? 0;
      const type  = (row.conversation_type ?? '').toUpperCase();
      raw_cost += cost;
      if (type === 'MARKETING')       marketing += count;
      else if (type === 'UTILITY')    utility   += count;
      else if (type === 'AUTHENTICATION') auth  += count;
      else                            service   += count;
    }

    return { marketing, utility, auth, service, raw_cost };
  } catch (e) {
    console.warn('[MetaBilling] Fetch failed:', e);
    return null;
  }
}

// GET — list all snapshots; ?sync=1 triggers auto-fetch from Meta
export async function GET(req: NextRequest) {
  const db = await checkAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const autoSync    = req.nextUrl.searchParams.get('sync') === '1';
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';

  if (autoSync) {
    const { data: workspaces } = await db
      .from('workspaces')
      .select('id, name, waba_id, phone_number_id, access_token, owner_email, owner_phone')
      .not('waba_id', 'is', null)
      .not('access_token', 'is', null)
      .eq('is_active', true);

    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    let synced  = 0;

    for (const ws of workspaces ?? []) {
      // Try Meta API first
      let analytics = await fetchMetaConversationAnalytics(ws.waba_id, ws.access_token, start, now);

      // Fallback: derive marketing count from actual campaign sends this month
      if (!analytics || (analytics.marketing + analytics.utility + analytics.auth + analytics.service) === 0) {
        const { data: campData } = await db
          .from('campaigns')
          .select('sent_count')
          .eq('workspace_id', ws.id)
          .eq('status', 'completed')
          .gte('created_at', start.toISOString());
        const campaignSent = (campData ?? []).reduce((a: number, c: any) => a + (c.sent_count ?? 0), 0);
        if (campaignSent > 0) {
          analytics = { marketing: campaignSent, utility: 0, auth: 0, service: 0, raw_cost: 0 };
        }
      }

      if (!analytics || (analytics.marketing + analytics.utility + analytics.auth + analytics.service) === 0) continue;

      const total_inr = +(
        analytics.marketing * RATES.marketing +
        analytics.utility   * RATES.utility   +
        analytics.auth      * RATES.auth      +
        analytics.service   * RATES.service
      ).toFixed(2);

      await db.from('meta_billing_snapshots').upsert({
        workspace_id:    ws.id,
        waba_id:         ws.waba_id,
        month:           currentMonth,
        marketing_count: analytics.marketing,
        utility_count:   analytics.utility,
        auth_count:      analytics.auth,
        service_count:   analytics.service,
        total_inr,
        fetched_at:      new Date().toISOString(),
      }, { onConflict: 'workspace_id,month' });

      synced++;
    }

    console.log(`[MetaBilling] Synced ${synced} of ${(workspaces ?? []).length} workspaces`);
  }

  const { data: snapshots, error } = await db
    .from('meta_billing_snapshots')
    .select(`
      id, workspace_id, waba_id, month,
      marketing_count, utility_count, auth_count, service_count,
      total_inr, fetched_at,
      workspaces(id, name, phone_number_id, access_token, is_active, subscription_status, owner_email, owner_phone)
    `)
    .eq('month', currentMonth)
    .order('total_inr', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: snapshots ?? [], synced_at: new Date().toISOString() });
}

// POST — upsert one workspace (auto-fetch from Meta or manual counts)
export async function POST(req: NextRequest) {
  const db = await checkAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    workspace_id:     string;
    marketing_count?: number;
    utility_count?:   number;
    auth_count?:      number;
    service_count?:   number;
    // invoice sending
    send_invoice?:    boolean;
  };

  const { workspace_id } = body;
  const { data: ws } = await db
    .from('workspaces')
    .select('id, name, waba_id, phone_number_id, access_token, owner_email, owner_phone')
    .eq('id', workspace_id)
    .single();

  if (!ws?.waba_id) return NextResponse.json({ error: 'WABA ID not configured for this workspace' }, { status: 400 });

  let marketing = body.marketing_count ?? 0;
  let utility   = body.utility_count   ?? 0;
  let auth      = body.auth_count      ?? 0;
  let service   = body.service_count   ?? 0;
  let fromMeta  = false;

  // Auto-fetch if no manual counts provided
  if (body.marketing_count === undefined) {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Try Meta Graph API
    if (ws.waba_id && ws.access_token) {
      const analytics = await fetchMetaConversationAnalytics(ws.waba_id, ws.access_token, start, now);
      if (analytics && (analytics.marketing + analytics.utility + analytics.auth + analytics.service) > 0) {
        marketing = analytics.marketing;
        utility   = analytics.utility;
        auth      = analytics.auth;
        service   = analytics.service;
        fromMeta  = true;
      }
    }

    // 2. Fallback: derive from actual campaign sends this month
    if (!fromMeta) {
      const { data: campData } = await db
        .from('campaigns')
        .select('sent_count')
        .eq('workspace_id', workspace_id)
        .eq('status', 'completed')
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
      const campaignSent = (campData ?? []).reduce((a: number, c: any) => a + (c.sent_count ?? 0), 0);
      if (campaignSent > 0) {
        marketing = campaignSent;
      }
    }

    // 3. If still 0 (no Meta data AND no campaigns), keep existing data — don't overwrite with zeros
    if (marketing + utility + auth + service === 0) {
      const { data: existing } = await db
        .from('meta_billing_snapshots')
        .select('marketing_count, utility_count, auth_count, service_count')
        .eq('workspace_id', workspace_id)
        .eq('month', new Date().toISOString().slice(0, 7) + '-01')
        .maybeSingle();
      if (existing) {
        return NextResponse.json({
          success: true,
          total_inr: +((existing.marketing_count * RATES.marketing) + (existing.utility_count * RATES.utility) + (existing.auth_count * RATES.auth) + (existing.service_count * RATES.service)).toFixed(2),
          from_meta_api: false,
          invoice_sent: false,
          note: 'No new data from Meta API — existing data preserved',
        });
      }
    }
  }

  const total_inr = +(
    marketing * RATES.marketing +
    utility   * RATES.utility   +
    auth      * RATES.auth      +
    service   * RATES.service
  ).toFixed(2);

  const month = new Date().toISOString().slice(0, 7) + '-01';

  const { error } = await db.from('meta_billing_snapshots').upsert({
    workspace_id,
    waba_id:         ws.waba_id,
    month,
    marketing_count: marketing,
    utility_count:   utility,
    auth_count:      auth,
    service_count:   service,
    total_inr,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,month' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send invoice via Email (primary) + WhatsApp (secondary) if requested
  let invoiceSent = false;
  let invoiceMethod = '';

  if (body.send_invoice) {
    const monthLabel = new Date(month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const subject    = `Meta WhatsApp API Bill — ${monthLabel} — ${ws.name}`;
    const breakdown  =
      `Marketing: ${marketing.toLocaleString()} convos × ₹${RATES.marketing} = ₹${(marketing * RATES.marketing).toFixed(2)}\n` +
      `Utility:   ${utility.toLocaleString()} convos × ₹${RATES.utility}   = ₹${(utility * RATES.utility).toFixed(2)}\n` +
      `Auth:      ${auth.toLocaleString()} convos × ₹${RATES.auth}        = ₹${(auth * RATES.auth).toFixed(2)}\n` +
      `Service:   ${service.toLocaleString()} convos × ₹${RATES.service}  = ₹${(service * RATES.service).toFixed(2)}\n`;

    // PRIMARY: Email via SMTP/Resend
    if (ws.owner_email) {
      try {
        const { createTransport } = await import('nodemailer');
        const transport = createTransport({
          host:   'smtp.gmail.com',
          port:   587,
          secure: false,
          auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transport.sendMail({
          from:    `Agentix Billing <${process.env.SMTP_USER}>`,
          to:      ws.owner_email,
          subject,
          text:
            `Dear ${ws.name} Team,\n\n` +
            `Here is your Meta WhatsApp API usage bill for ${monthLabel}:\n\n` +
            breakdown +
            `\nTOTAL: ₹${total_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n\n` +
            `Please transfer the amount to Agentix:\n` +
            `UPI: aiagentix2025@gmail.com\n` +
            `Email: aiagentix2025@gmail.com\n\n` +
            `Note: This is an estimated bill based on campaign conversations.\n` +
            `For exact Meta charges, check: https://business.facebook.com/latest/whatsapp_manager/billing/\n\n` +
            `Thank you,\nAgentix Team`,
          html:
            `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">` +
            `<h2 style="color:#F97316">🧾 Meta WhatsApp API Bill — ${monthLabel}</h2>` +
            `<p>Dear <strong>${ws.name}</strong> Team,</p>` +
            `<table style="width:100%;border-collapse:collapse;margin:16px 0">` +
            `<tr style="background:#f9fafb"><th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Type</th><th style="padding:8px;border-bottom:1px solid #e5e7eb">Conversations</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Amount</th></tr>` +
            `<tr><td style="padding:8px;border-bottom:1px solid #f3f4f6">Marketing</td><td style="text-align:center;padding:8px;border-bottom:1px solid #f3f4f6">${marketing.toLocaleString()}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f3f4f6">₹${(marketing * RATES.marketing).toFixed(2)}</td></tr>` +
            `<tr><td style="padding:8px;border-bottom:1px solid #f3f4f6">Utility</td><td style="text-align:center;padding:8px;border-bottom:1px solid #f3f4f6">${utility.toLocaleString()}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f3f4f6">₹${(utility * RATES.utility).toFixed(2)}</td></tr>` +
            `<tr><td style="padding:8px;border-bottom:1px solid #f3f4f6">Auth</td><td style="text-align:center;padding:8px;border-bottom:1px solid #f3f4f6">${auth.toLocaleString()}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f3f4f6">₹${(auth * RATES.auth).toFixed(2)}</td></tr>` +
            `<tr><td style="padding:8px">Service</td><td style="text-align:center;padding:8px">${service.toLocaleString()}</td><td style="text-align:right;padding:8px">₹${(service * RATES.service).toFixed(2)}</td></tr>` +
            `<tr style="background:#fff7ed"><td colspan="2" style="padding:10px;font-weight:bold">TOTAL</td><td style="text-align:right;padding:10px;font-size:18px;font-weight:bold;color:#F97316">₹${total_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` +
            `</table>` +
            `<div style="background:#f9fafb;border-radius:8px;padding:16px;margin-top:16px">` +
            `<p style="margin:0 0 8px;font-weight:bold">Payment Details:</p>` +
            `<p style="margin:4px 0">UPI: <strong>aiagentix2025@gmail.com</strong></p>` +
            `<p style="margin:4px 0">Email: aiagentix2025@gmail.com</p>` +
            `</div>` +
            `<p style="color:#9ca3af;font-size:12px;margin-top:16px">This is an estimate from campaign data. Verify exact charges at Meta Business Manager.</p>` +
            `</div>`,
        });
        invoiceSent  = true;
        invoiceMethod = 'email';
      } catch (e) {
        console.warn('[MetaBilling] Email send failed:', e);
      }
    }

    // SECONDARY: WhatsApp (try even if email worked)
    if (ws.owner_phone && ws.phone_number_id && ws.access_token) {
      try {
        const token = ws.access_token.replace(/﻿/g, '').trim();
        const waText =
          `🧾 *Meta WhatsApp Bill — ${monthLabel}*\n` +
          `Hi ${ws.name},\n\n` +
          `Your Meta API usage charges:\n\n` +
          `📊 *Breakdown:*\n` +
          `• Marketing: ${marketing.toLocaleString()} × ₹${RATES.marketing} = ₹${(marketing * RATES.marketing).toFixed(2)}\n` +
          `• Utility: ${utility.toLocaleString()} × ₹${RATES.utility} = ₹${(utility * RATES.utility).toFixed(2)}\n` +
          `• Service: ${service.toLocaleString()} × ₹${RATES.service} = ₹${(service * RATES.service).toFixed(2)}\n\n` +
          `💰 *Total: ₹${total_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}*\n\n` +
          `Pay to Agentix:\nUPI: aiagentix2025@gmail.com\n\n` +
          `— Agentix Team`;

        const waRes = await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to:   ws.owner_phone.replace(/\D/g, ''),
            type: 'text',
            text: { body: waText, preview_url: false },
          }),
        });
        if (waRes.ok) {
          invoiceSent   = true;
          invoiceMethod = invoiceMethod ? `${invoiceMethod}+whatsapp` : 'whatsapp';
        } else {
          const e = await waRes.json() as { error?: { message: string } };
          console.warn('[MetaBilling] WhatsApp invoice failed:', e?.error?.message);
        }
      } catch (e) {
        console.warn('[MetaBilling] WhatsApp invoice error:', e);
      }
    }

    if (!invoiceSent) {
      return NextResponse.json({
        success: true, total_inr, from_meta_api: fromMeta, invoice_sent: false,
        error: 'No owner email or phone configured for this workspace. Add them in Client Settings.',
      });
    }
  }

  return NextResponse.json({ success: true, total_inr, from_meta_api: fromMeta, invoice_sent: invoiceSent, invoice_method: invoiceMethod });
}

// PATCH — mark as paid / pay all
export async function PATCH(req: NextRequest) {
  const db = await checkAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    pay_all?:       boolean;          // mark ALL this month's snapshots as paid
    workspace_id?:  string;           // mark single workspace as paid
    payment_method: string;           // 'card' | 'upi' | 'bank'
    payment_note?:  string;
    unpay?:         boolean;          // unmark paid
  };

  const month = new Date().toISOString().slice(0, 7) + '-01';
  const now   = new Date().toISOString();

  const patch = body.unpay
    ? { admin_paid: false, admin_paid_at: null, payment_method: null, payment_note: null }
    : { admin_paid: true, admin_paid_at: now, payment_method: body.payment_method ?? 'card', payment_note: body.payment_note ?? null };

  if (body.pay_all) {
    // Mark ALL snapshots for this month as paid
    const { error, count } = await db
      .from('meta_billing_snapshots')
      .update(patch)
      .eq('month', month)
      .select('id', { count: 'exact', head: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: count ?? 0 });
  }

  if (body.workspace_id) {
    // Mark single workspace as paid
    const { error } = await db
      .from('meta_billing_snapshots')
      .update(patch)
      .eq('workspace_id', body.workspace_id)
      .eq('month', month);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Provide pay_all or workspace_id' }, { status: 400 });
}

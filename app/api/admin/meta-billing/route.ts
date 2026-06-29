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

  // Auto-fetch if no manual counts
  if (body.marketing_count === undefined && ws.waba_id && ws.access_token) {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const analytics = await fetchMetaConversationAnalytics(ws.waba_id, ws.access_token, start, now);
    if (analytics && (analytics.marketing + analytics.utility + analytics.auth + analytics.service) > 0) {
      marketing = analytics.marketing;
      utility   = analytics.utility;
      auth      = analytics.auth;
      service   = analytics.service;
      fromMeta  = true;
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

  // Send invoice via WhatsApp to owner_phone if requested
  let invoiceSent = false;
  if (body.send_invoice && ws.owner_phone && ws.phone_number_id && ws.access_token) {
    const monthLabel = new Date(month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const invoiceText =
      `🧾 *Meta WhatsApp Billing — ${monthLabel}*\n` +
      `Client: ${ws.name}\n\n` +
      `📊 *Conversation Breakdown:*\n` +
      `• Marketing: ${marketing.toLocaleString()} × ₹${RATES.marketing} = ₹${(marketing * RATES.marketing).toFixed(2)}\n` +
      `• Utility: ${utility.toLocaleString()} × ₹${RATES.utility} = ₹${(utility * RATES.utility).toFixed(2)}\n` +
      `• Auth: ${auth.toLocaleString()} × ₹${RATES.auth} = ₹${(auth * RATES.auth).toFixed(2)}\n` +
      `• Service: ${service.toLocaleString()} × ₹${RATES.service} = ₹${(service * RATES.service).toFixed(2)}\n\n` +
      `💰 *Total: ₹${total_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}*\n\n` +
      `Please transfer the amount to Agentix:\n` +
      `UPI: aiagentix2025@gmail.com\n` +
      `Contact: aiagentix2025@gmail.com`;

    try {
      const token = ws.access_token.replace(/﻿/g, '').trim();
      const sendRes = await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: ws.owner_phone.replace(/\D/g, ''),
          type: 'text',
          text: { body: invoiceText, preview_url: false },
        }),
      });
      invoiceSent = sendRes.ok;
      if (!sendRes.ok) {
        const e = await sendRes.json() as { error?: { message: string } };
        console.warn('[MetaBilling] Invoice send failed:', e?.error?.message);
      }
    } catch (e) {
      console.warn('[MetaBilling] Invoice WhatsApp send error:', e);
    }
  }

  return NextResponse.json({ success: true, total_inr, from_meta_api: fromMeta, invoice_sent: invoiceSent });
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

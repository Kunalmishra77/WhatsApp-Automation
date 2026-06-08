import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/cron/automation-triggers
// Runs daily — processes birthday and re-engagement triggers across all workspaces.
export async function GET(request: NextRequest) {
  const url    = new URL(request.url);
  const secret = url.searchParams.get('secret') ?? '';
  const allowed =
    secret === (process.env.CRON_SECRET ?? 'agentix2026cron') ||
    request.headers.get('x-vercel-cron') === '1';
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db  = createAdminClient() as any;
  const now = new Date();
  let processed = 0;
  let failed    = 0;

  // Fetch all active automation triggers
  const { data: triggers } = await db
    .from('automation_triggers')
    .select('*, workspaces(phone_number_id, access_token)')
    .eq('is_active', true)
    .in('trigger_type', ['birthday', 're_engagement']);

  for (const trigger of (triggers ?? [])) {
    const ws = trigger.workspaces as { phone_number_id?: string; access_token?: string } | null;
    if (!ws?.phone_number_id || !ws?.access_token) continue;

    const token   = (ws.access_token as string).replace(/﻿/g, '').trim();
    const phoneId = ws.phone_number_id as string;

    try {
      if (trigger.trigger_type === 'birthday') {
        await processBirthdayTrigger(db, trigger, phoneId, token, now);
        processed++;
      } else if (trigger.trigger_type === 're_engagement') {
        await processReEngagementTrigger(db, trigger, phoneId, token, now);
        processed++;
      }
      // Mark last_ran_at
      await db.from('automation_triggers')
        .update({ last_ran_at: now.toISOString() })
        .eq('id', trigger.id);
    } catch (err) {
      console.error(`[AutoTriggers] trigger ${trigger.id} failed:`, err);
      failed++;
    }
  }

  return NextResponse.json({ processed, failed, at: now.toISOString() });
}

// ── Birthday trigger ──────────────────────────────────────────────────────
async function processBirthdayTrigger(
  db: any,
  trigger: any,
  phoneId: string,
  token: string,
  now: Date,
) {
  // Find contacts whose birthday (in custom_fields) matches today's MM-DD
  const todayMMDD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fieldKey  = (trigger.config?.custom_field_key as string) ?? 'birthday';

  // Fetch contacts and filter in-app (Postgres JSONB date comparison is tricky cross-year)
  const { data: contacts } = await db
    .from('contacts')
    .select('id, phone, name, custom_fields')
    .eq('workspace_id', trigger.workspace_id)
    .eq('opted_out', false)
    .eq('is_blocked', false);

  const todayBirthdays = (contacts ?? []).filter((c: any) => {
    const val = c.custom_fields?.[fieldKey] as string | undefined;
    if (!val) return false;
    // Accept YYYY-MM-DD, MM-DD, or DD/MM/YYYY formats
    const mmdd = val.length === 10 && val[4] === '-'
      ? val.slice(5, 10)           // YYYY-MM-DD → MM-DD
      : val.length === 5 && val[2] === '-'
        ? val                      // already MM-DD
        : val.split('/').length === 3
          ? `${val.split('/')[1].padStart(2,'0')}-${val.split('/')[0].padStart(2,'0')}`  // DD/MM/YYYY
          : null;
    return mmdd === todayMMDD;
  });

  for (const contact of todayBirthdays) {
    await sendAndLog(db, trigger, contact, phoneId, token);
  }
}

// ── Re-engagement trigger ─────────────────────────────────────────────────
async function processReEngagementTrigger(
  db: any,
  trigger: any,
  phoneId: string,
  token: string,
  now: Date,
) {
  const days     = (trigger.config?.days as number) ?? 7;
  const cutoff   = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const tagsFilter = trigger.audience_filter?.tags as string[] | undefined;

  // Find contacts with conversations where last inbound was > X days ago
  let q = db
    .from('contacts')
    .select('id, phone, name, conversations!inner(last_message_at, status)')
    .eq('workspace_id', trigger.workspace_id)
    .eq('opted_out', false)
    .eq('is_blocked', false)
    .neq('conversations.status', 'resolved')
    .lt('conversations.last_message_at', cutoff);

  if (tagsFilter?.length) {
    q = q.overlaps('tags', tagsFilter);
  }

  const { data: contacts } = await q;

  for (const contact of (contacts ?? [])) {
    // Skip if we already sent this trigger to this contact in the past X days
    const { data: recentLog } = await db
      .from('automation_trigger_logs')
      .select('id')
      .eq('trigger_id', trigger.id)
      .eq('contact_id', contact.id)
      .gte('executed_at', cutoff)
      .maybeSingle();
    if (recentLog) continue;

    await sendAndLog(db, trigger, contact, phoneId, token);
  }
}

// ── Shared: send WA message + log ─────────────────────────────────────────
async function sendAndLog(
  db: any,
  trigger: any,
  contact: { id: string; phone: string; name?: string },
  phoneId: string,
  token: string,
) {
  // Personalise message — replace {{name}} placeholder
  const message = (trigger.message as string).replace(/\{\{name\}\}/gi, contact.name ?? 'there');

  let status: 'sent' | 'failed' = 'sent';
  let errorMsg: string | undefined;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: contact.phone,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
      },
    );
    if (!res.ok) {
      const err = await res.json() as any;
      status   = 'failed';
      errorMsg = err?.error?.message ?? 'WhatsApp API error';
      console.error(`[AutoTriggers] send failed → ${contact.phone}:`, errorMsg);
    }
  } catch (err) {
    status   = 'failed';
    errorMsg = String(err);
  }

  await db.from('automation_trigger_logs').insert({
    trigger_id:   trigger.id,
    workspace_id: trigger.workspace_id,
    contact_id:   contact.id,
    contact_phone: contact.phone,
    status,
    error:        errorMsg ?? null,
  });
}

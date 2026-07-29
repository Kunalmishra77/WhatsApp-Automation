// Missed-reply watchdog: a platform-wide safety net that answers any customer
// whose latest WhatsApp message went unanswered. Reuses the shared AI reply core
// (getAIReply + fetchKnowledgeBaseContext) so replies match each workspace's
// persona/KB. Never modifies the real-time webhook path. Every path fails open.

import { getAIReply, fetchKnowledgeBaseContext } from '@/lib/ai-reply';
import { isWithinBusinessHours, type BusinessHoursConfig } from '@/app/api/business-hours/route';

const DECLINE_PATTERNS = [
  'not interested', 'no thanks', 'no thank you', 'stop', 'unsubscribe',
  'band karo', 'band kar', 'mat bhejo', 'nahi chahiye', 'dont want', "don't want",
];

/** True when the customer's last message is a decline / opt-out signal — do not re-engage. */
export function isDeclineMessage(content: string | null | undefined): boolean {
  if (!content) return false;
  const t = content.toLowerCase();
  return DECLINE_PATTERNS.some((p) => t.includes(p));
}

export interface SweepRow {
  conversation_id: string;
  workspace_id: string;
  contact_id: string;
  phone: string;
  name: string | null;
  last_content: string | null;
  last_at: string;
  phone_number_id: string;
  access_token: string;
  settings: Record<string, unknown> | null;
  business_name: string | null;
}

export interface SweepOpts { minAgeMinutes: number; windowHours: number; limit: number; }

/**
 * Conversations whose latest message is an unanswered inbound within the window.
 * Heavy gates (status/bot_paused/blocked/opted_out/creds/persona/no-later-outbound/
 * no-active-flow) run in the get_unanswered_conversations SQL function; the
 * decline-signal filter runs here.
 */
export async function findUnansweredConversations(supabase: any, opts: SweepOpts): Promise<SweepRow[]> {
  const { data, error } = await supabase.rpc('get_unanswered_conversations', {
    p_min_age_minutes: opts.minAgeMinutes,
    p_window_hours: opts.windowHours,
    p_limit: opts.limit,
  });
  if (error || !Array.isArray(data)) {
    if (error) console.error('[ReplySweep] rpc error:', error.message);
    return [];
  }
  return (data as SweepRow[]).filter((r) => !isDeclineMessage(r.last_content));
}

function cleanToken(token: string): string {
  return String(token).replace(/﻿/g, '').trim();
}

async function sendWhatsAppText(phoneNumberId: string, token: string, to: string, body: string): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } }),
  });
  const data = await res.json().catch(() => ({}));
  const wamid = (data as any)?.messages?.[0]?.id ?? null;
  if (!res.ok || !wamid) {
    console.error('[ReplySweep] send failed:', JSON.stringify((data as any)?.error ?? data).slice(0, 160));
    return null;
  }
  return wamid;
}

// Records the sent reply. Returns false if the message insert failed — the caller
// MUST then report 'failed' (not 'sent'): an unrecorded send leaves the inbound as
// the conversation's latest message, so the next sweep would re-send a duplicate.
async function record(supabase: any, row: SweepRow, body: string, wamid: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { error: insErr } = await supabase.from('messages').insert({
    conversation_id: row.conversation_id, workspace_id: row.workspace_id, sender_type: 'bot',
    sender_id: null, direction: 'outbound', type: 'text', content: body, status: 'sent',
    whatsapp_msg_id: wamid, created_at: now,
  });
  if (insErr) {
    console.error('[ReplySweep] record insert failed (will not re-send — reported as failed):', insErr.message);
    return false;
  }
  await supabase.from('conversations').update({ last_message: body, last_message_at: now }).eq('id', row.conversation_id);
  return true;
}

/** Send the catch-up reply for one unanswered conversation. Idempotent + fail-open. */
export async function sendCatchupReply(supabase: any, row: SweepRow): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    // Idempotency re-check: the real-time path may have answered since the scan.
    // Fail CLOSED — if the check itself errors, skip rather than risk a duplicate.
    const { data: later, error: recheckErr } = await supabase.from('messages').select('id')
      .eq('conversation_id', row.conversation_id).eq('direction', 'outbound').gte('created_at', row.last_at).limit(1);
    if (recheckErr) { console.error('[ReplySweep] idempotency re-check failed — skipping:', recheckErr.message); return 'skipped'; }
    if (later && later.length) return 'skipped';

    const token = cleanToken(row.access_token);

    // Business hours: outside hours → away message (once; idempotency stops repeats).
    const { data: bh } = await supabase.from('business_hours').select('*').eq('workspace_id', row.workspace_id).maybeSingle();
    if (bh?.is_enabled && !isWithinBusinessHours(bh as BusinessHoursConfig)) {
      if (!bh.away_message) return 'skipped';
      const wamid = await sendWhatsAppText(row.phone_number_id, token, row.phone, bh.away_message);
      if (!wamid) return 'failed';
      return (await record(supabase, row, bh.away_message, wamid)) ? 'sent' : 'failed';
    }

    const name = row.name && row.name !== row.phone ? (row.name.split(' ')[0] ?? row.name) : 'there';
    const settings = (row.settings ?? {}) as Record<string, unknown>;

    // Conversation history (oldest→newest). Fetch 41 and drop the newest (the
    // trigger message) — getAIReply appends row.last_content as the final user
    // turn, so including it here too would duplicate it (matches the webhook path).
    const { data: hist } = await supabase.from('messages').select('content, sender_type')
      .eq('conversation_id', row.conversation_id).order('created_at', { ascending: false }).limit(41);
    const history = ((hist ?? []) as Array<{ content: string; sender_type: string }>).slice(1).reverse()
      .map((m) => ({ role: (m.sender_type === 'contact' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.content ?? '' }))
      .filter((m) => m.content.length > 0);

    const kb = await fetchKnowledgeBaseContext(supabase, row.workspace_id, row.last_content ?? '').catch(() => '');
    const reply = await getAIReply(row.last_content ?? '', name, kb, undefined, settings, row.business_name || 'our team', history);
    if (!reply) return 'failed';

    const wamid = await sendWhatsAppText(row.phone_number_id, token, row.phone, reply);
    if (!wamid) return 'failed';
    return (await record(supabase, row, reply, wamid)) ? 'sent' : 'failed';
  } catch (e) {
    console.error('[ReplySweep] error:', (e as Error).message);
    return 'failed';
  }
}

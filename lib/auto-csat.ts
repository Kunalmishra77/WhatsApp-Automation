// Auto-CSAT: automatically asks customers to rate their experience (1-5) after a
// conversation naturally wraps up, and captures the reply. Mirrors lib/reply-sweep.ts's
// structure (findCandidates + send helper + local sendWhatsAppText) but is a distinct,
// additive feature — it never touches the existing manual CSAT flow (csat_responses rows
// pre-seeded with a NULL score), it only acts on conversations it itself flagged via
// conversations.meta.csat_sent_at / csat_pending. Fail-open on unexpected errors, but
// fail CLOSED on the in-window / once-only guards — never risk a stray or duplicate send.

const QUIET_HOURS = 4;          // conversation must have been silent this long before we ask
const INBOUND_WINDOW_HOURS = 24; // WhatsApp's free-form service-message window
const MESSAGE_LOOKBACK = 50;     // recent messages fetched per candidate to compute eligibility

export const CSAT_PROMPT =
  "Thanks for chatting with us! 🙏 How would you rate your experience? Reply with a number from 1 (poor) to 5 (excellent).";
export const CSAT_THANK_YOU = 'Thank you for your feedback! 🙏';

export interface CsatCandidate {
  conversation_id: string;
  workspace_id: string;
  contact_id: string;
  phone: string;
  phone_number_id: string;
  access_token: string;
  meta: Record<string, unknown>;
}

function cleanToken(token: string): string {
  return String(token).replace(/﻿/g, '').trim();
}

export async function sendWhatsAppText(phoneNumberId: string, token: string, to: string, body: string): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } }),
  });
  const data = await res.json().catch(() => ({}));
  const wamid = (data as any)?.messages?.[0]?.id ?? null;
  if (!res.ok || !wamid) {
    console.error('[AutoCSAT] send failed:', JSON.stringify((data as any)?.error ?? data).slice(0, 160));
    return null;
  }
  return wamid;
}

interface FindOpts { limit: number; }

/**
 * Conversations eligible for an auto-CSAT ask. A conversation qualifies only when ALL hold:
 *  - never asked before (meta.csat_sent_at is unset)
 *  - the customer's LAST INBOUND message was within the last 24h (WhatsApp free-message window —
 *    outside it we'd need a template, so we SKIP rather than risk sending outside the window)
 *  - the conversation's LAST message overall is outbound (bot already replied; not chasing a
 *    customer who hasn't been answered yet)
 *  - it has been quiet >= 4h since that last message (conversation naturally wound down)
 *  - the conversation had >= 2 inbound messages (a genuine back-and-forth, not a one-off/spam ping)
 *  - bot is not paused, conversation not flagged spam, contact not opted out / blocked
 *
 * Implementation: cheap column filters run in Postgres (via supabase-js), the message-history
 * checks (last-inbound-recency / last-message-direction / inbound-count) run in JS per candidate
 * — the candidate set at this point is already narrow (quiet 4h+, never asked), so this stays cheap.
 */
export async function findCsatCandidates(db: any, opts: FindOpts): Promise<CsatCandidate[]> {
  const { limit } = opts;
  const quietBefore = new Date(Date.now() - QUIET_HOURS * 60 * 60 * 1000).toISOString();
  const inboundCutoff = Date.now() - INBOUND_WINDOW_HOURS * 60 * 60 * 1000;

  // Scan a wider window than `limit` since some candidates will be filtered out below —
  // capped so a busy platform can never turn this into an unbounded scan.
  const scanWindow = Math.min(Math.max(limit * 8, 120), 300);

  const { data: convRows, error: convErr } = await db
    .from('conversations')
    .select('id, workspace_id, contact_id, last_message_at, meta, bot_paused, is_spam')
    .not('last_message_at', 'is', null)
    .lte('last_message_at', quietBefore)
    .order('last_message_at', { ascending: true })
    .limit(scanWindow);

  if (convErr || !Array.isArray(convRows)) {
    if (convErr) console.error('[AutoCSAT] conversations query error:', convErr.message);
    return [];
  }

  // In-JS gates that would otherwise need a raw jsonb-path filter: never-asked-before,
  // bot not paused, not spam. COALESCE-equivalent: a null flag counts as "false".
  const pre = (convRows as Array<Record<string, any>>).filter((r) => {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    if (meta.csat_sent_at) return false;
    if (r.bot_paused === true) return false;
    if (r.is_spam === true) return false;
    return true;
  });
  if (!pre.length) return [];

  const contactIds = [...new Set(pre.map((r) => r.contact_id))];
  const workspaceIds = [...new Set(pre.map((r) => r.workspace_id))];

  const [{ data: contacts }, { data: workspaces }] = await Promise.all([
    db.from('contacts').select('id, phone, opted_out, is_blocked').in('id', contactIds),
    db.from('workspaces').select('id, phone_number_id, access_token').in('id', workspaceIds)
      .not('phone_number_id', 'is', null).not('access_token', 'is', null),
  ]);

  const contactById = new Map<string, any>((contacts ?? []).map((c: any) => [c.id, c]));
  const wsById = new Map<string, any>((workspaces ?? []).map((w: any) => [w.id, w]));

  const candidates: CsatCandidate[] = [];

  for (const row of pre) {
    if (candidates.length >= limit) break;

    const contact = contactById.get(row.contact_id);
    if (!contact || contact.opted_out === true || contact.is_blocked === true || !contact.phone) continue;

    const ws = wsById.get(row.workspace_id);
    if (!ws) continue; // missing/incomplete creds — filtered by the .not() above already

    // Message-history gates: last message overall must be outbound, last inbound must be
    // within the WhatsApp free-message window, and there must be a genuine back-and-forth.
    const { data: recent, error: msgErr } = await db
      .from('messages')
      .select('direction, created_at')
      .eq('conversation_id', row.id)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_LOOKBACK);
    if (msgErr || !Array.isArray(recent) || !recent.length) continue;

    if (recent[0].direction !== 'outbound') continue; // bot hasn't replied yet — don't chase

    const inbound = recent.filter((m: any) => m.direction === 'inbound');
    if (inbound.length < 2) continue; // not a genuine conversation

    const lastInboundAt = new Date(inbound[0].created_at).getTime();
    if (!(lastInboundAt >= inboundCutoff)) continue; // outside the 24h free-message window

    candidates.push({
      conversation_id: row.id,
      workspace_id: row.workspace_id,
      contact_id: row.contact_id,
      phone: contact.phone,
      phone_number_id: ws.phone_number_id,
      access_token: ws.access_token,
      meta: (row.meta ?? {}) as Record<string, unknown>,
    });
  }

  return candidates;
}

/**
 * Sends the CSAT prompt for one eligible conversation and records it (message row +
 * conversations.meta flags). Fail-open on send/record errors — returns 'failed' rather
 * than throwing, so one bad conversation never aborts the whole cron run.
 */
export async function sendCsatPrompt(db: any, candidate: CsatCandidate): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    // Idempotency re-check: guards against overlapping cron runs / a re-scan racing this
    // send. Fail CLOSED — if the check itself errors, skip rather than risk a duplicate ask.
    const { data: fresh, error: recheckErr } = await db
      .from('conversations').select('meta').eq('id', candidate.conversation_id).maybeSingle();
    if (recheckErr) { console.error('[AutoCSAT] idempotency re-check failed — skipping:', recheckErr.message); return 'skipped'; }
    const freshMeta = (fresh?.meta ?? {}) as Record<string, unknown>;
    if (freshMeta.csat_sent_at) return 'skipped'; // already asked since this candidate was scanned

    const token = cleanToken(candidate.access_token);
    const wamid = await sendWhatsAppText(candidate.phone_number_id, token, candidate.phone, CSAT_PROMPT);
    if (!wamid) return 'failed';

    const now = new Date().toISOString();

    const { error: insErr } = await db.from('messages').insert({
      conversation_id: candidate.conversation_id,
      workspace_id: candidate.workspace_id,
      sender_type: 'bot',
      sender_id: null,
      direction: 'outbound',
      type: 'text',
      content: CSAT_PROMPT,
      status: 'sent',
      whatsapp_msg_id: wamid,
      created_at: now,
    });
    if (insErr) {
      console.error('[AutoCSAT] message insert failed (send already happened, not retried):', insErr.message);
      return 'failed';
    }

    const { error: updErr } = await db.from('conversations').update({
      meta: { ...freshMeta, csat_sent_at: now, csat_pending: true },
      last_message: CSAT_PROMPT,
      last_message_at: now,
    }).eq('id', candidate.conversation_id);
    if (updErr) {
      console.error('[AutoCSAT] conversation update failed:', updErr.message);
      return 'failed';
    }

    return 'sent';
  } catch (e) {
    console.error('[AutoCSAT] error:', (e as Error).message);
    return 'failed';
  }
}

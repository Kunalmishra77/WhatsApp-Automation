export interface RecipientCandidate {
  id: string;
  campaign_id: string;
  sent_at: string | null;
  whatsapp_msg_id: string | null;
  status: string;
}

// A recipient in one of these states is not an open target for a new reply:
// already replied, filtered out, or the send failed.
const TERMINAL = new Set(['replied', 'filtered', 'failed']);

/**
 * Decide which campaign_recipients row an inbound reply belongs to.
 *
 * Absolute guard: a reply can only attach to a send that already happened
 * (sent_at <= replyIso) — this is what stops yesterday's replies from leaking
 * into today's campaign. Prefers an exact quoted-template match (the WhatsApp
 * reply quoted the campaign message), else the most recent qualifying send.
 * Returns null when nothing qualifies.
 */
export function chooseRecipientForReply(
  candidates: RecipientCandidate[],
  replyIso: string,
  quotedWaMsgId?: string | null,
): RecipientCandidate | null {
  const replyMs = Date.parse(replyIso);
  if (Number.isNaN(replyMs)) return null;

  const eligible = candidates.filter((c) => {
    if (TERMINAL.has(c.status)) return false;
    if (!c.sent_at) return false;
    const sentMs = Date.parse(c.sent_at);
    return !Number.isNaN(sentMs) && sentMs <= replyMs;
  });
  if (eligible.length === 0) return null;

  if (quotedWaMsgId) {
    const quoted = eligible.find((c) => c.whatsapp_msg_id && c.whatsapp_msg_id === quotedWaMsgId);
    if (quoted) return quoted;
  }

  // Latest send that still precedes the reply; ties broken by id for determinism.
  return eligible.reduce((best, c) => {
    const bMs = Date.parse(best.sent_at as string);
    const cMs = Date.parse(c.sent_at as string);
    if (cMs > bMs) return c;
    if (cMs === bMs && c.id > best.id) return c;
    return best;
  });
}

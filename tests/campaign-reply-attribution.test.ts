import { describe, it, expect } from 'vitest';
import { chooseRecipientForReply, type RecipientCandidate } from '@/lib/campaign-reply-attribution';

const mk = (o: Partial<RecipientCandidate>): RecipientCandidate => ({
  id: 'r1', campaign_id: 'c1', sent_at: '2026-09-08T08:00:00Z', whatsapp_msg_id: null, status: 'sent', ...o,
});

describe('chooseRecipientForReply', () => {
  it('never attributes a reply that predates the send', () => {
    const cands = [mk({ id: 'r1', campaign_id: 'yday', sent_at: '2026-09-07T12:00:00Z' })];
    expect(chooseRecipientForReply(cands, '2026-09-06T12:00:00Z')).toBeNull();
  });

  it('picks the latest send that precedes the reply (today over yesterday)', () => {
    const cands = [
      mk({ id: 'y', campaign_id: 'yday', sent_at: '2026-09-07T12:47:00Z' }),
      mk({ id: 't', campaign_id: 'today', sent_at: '2026-09-08T08:27:00Z' }),
    ];
    expect(chooseRecipientForReply(cands, '2026-09-08T09:00:00Z')?.id).toBe('t');
  });

  it("attributes to yesterday when the reply came before today's send", () => {
    const cands = [
      mk({ id: 'y', campaign_id: 'yday', sent_at: '2026-09-07T12:47:00Z' }),
      mk({ id: 't', campaign_id: 'today', sent_at: '2026-09-08T08:27:00Z' }),
    ];
    // the exact VMS case: reply at 2026-09-07 18:17 — only yesterday's send precedes it
    expect(chooseRecipientForReply(cands, '2026-09-07T18:17:00Z')?.id).toBe('y');
  });

  it('prefers the quoted-message match even if an older send', () => {
    const cands = [
      mk({ id: 'y', campaign_id: 'yday', sent_at: '2026-09-07T12:47:00Z', whatsapp_msg_id: 'wamid.Y' }),
      mk({ id: 't', campaign_id: 'today', sent_at: '2026-09-08T08:27:00Z', whatsapp_msg_id: 'wamid.T' }),
    ];
    expect(chooseRecipientForReply(cands, '2026-09-08T09:00:00Z', 'wamid.Y')?.id).toBe('y');
  });

  it('ignores a quoted id whose send is in the future of the reply', () => {
    const cands = [
      mk({ id: 'y', campaign_id: 'yday', sent_at: '2026-09-07T12:47:00Z', whatsapp_msg_id: 'wamid.Y' }),
      mk({ id: 't', campaign_id: 'today', sent_at: '2026-09-08T08:27:00Z', whatsapp_msg_id: 'wamid.T' }),
    ];
    // quotes today's msg but reply time is before today's send -> falls back, and only yday qualifies
    expect(chooseRecipientForReply(cands, '2026-09-07T18:17:00Z', 'wamid.T')?.id).toBe('y');
  });

  it('skips already-replied / filtered / failed rows', () => {
    expect(chooseRecipientForReply([mk({ id: 't', status: 'replied' })], '2026-09-08T09:00:00Z')).toBeNull();
    expect(chooseRecipientForReply([mk({ id: 't', status: 'filtered' })], '2026-09-08T09:00:00Z')).toBeNull();
    expect(chooseRecipientForReply([mk({ id: 't', status: 'failed' })], '2026-09-08T09:00:00Z')).toBeNull();
  });

  it('ignores rows with null sent_at', () => {
    expect(chooseRecipientForReply([mk({ id: 't', sent_at: null })], '2026-09-08T09:00:00Z')).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(chooseRecipientForReply([], '2026-09-08T09:00:00Z')).toBeNull();
  });

  it('is deterministic on equal sent_at (greatest id wins)', () => {
    const cands = [
      mk({ id: 'a', sent_at: '2026-09-08T08:00:00Z' }),
      mk({ id: 'b', sent_at: '2026-09-08T08:00:00Z' }),
    ];
    expect(chooseRecipientForReply(cands, '2026-09-08T09:00:00Z')?.id).toBe('b');
  });
});

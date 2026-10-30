import { describe, it, expect } from 'vitest';
import {
  priorStatusesFor, isMessageStatus, MESSAGE_STATUS_RANK,
  tallyMessageStatuses, outboundDeliveryFunnel,
} from './message-status';

describe('priorStatusesFor', () => {
  // The bug this exists to stop: a late `delivered` receipt must not pull a
  // message that has already been read back to delivered.
  it('does not let delivered apply over read', () => {
    expect(priorStatusesFor('delivered')).not.toContain('read');
  });

  it('lets read apply over anything earlier', () => {
    expect(priorStatusesFor('read').sort()).toEqual(['delivered', 'queued', 'sent']);
  });

  it('lets delivered apply over queued and sent only', () => {
    expect(priorStatusesFor('delivered').sort()).toEqual(['queued', 'sent']);
  });

  // Outbound rows are inserted as 'sent', so the sent receipt that follows has
  // nothing to advance — the filter matches no row and no WAL is written.
  it('lets sent apply over queued only', () => {
    expect(priorStatusesFor('sent')).toEqual(['queued']);
  });

  // A message that reached the handset did not fail. Recording one would corrupt
  // the read and delivered counts the guard protects.
  it('does not let failed apply over delivered or read', () => {
    const prior = priorStatusesFor('failed');
    expect(prior).not.toContain('delivered');
    expect(prior).not.toContain('read');
    expect(prior.sort()).toEqual(['queued', 'sent']);
  });

  // No receipt may overwrite a terminal failure.
  it('never allows failed as a prior state', () => {
    for (const next of ['sent', 'delivered', 'read', 'failed'] as const) {
      expect(priorStatusesFor(next)).not.toContain('failed');
    }
  });

  it('never allows a status to apply over itself', () => {
    for (const next of ['sent', 'delivered', 'read', 'failed'] as const) {
      expect(priorStatusesFor(next)).not.toContain(next);
    }
  });
});

describe('isMessageStatus', () => {
  it('accepts the enum values', () => {
    for (const s of Object.keys(MESSAGE_STATUS_RANK)) expect(isMessageStatus(s)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isMessageStatus('deleted')).toBe(false);
    expect(isMessageStatus('')).toBe(false);
    expect(isMessageStatus('READ')).toBe(false);
  });
});

// Razorveda's October 2026 traffic, exactly as `analytics_message_status_counts`
// returns it. The four numbers the replaced per-bucket counts produced for that
// window were sent 2704, delivered 2645, read 2274, failed 13 — the funnel must
// still say so.
//
// The inbound row is the whole reason the funnel is outbound-only: every inbound
// message is stored 'delivered' at ingestion and none is ever 'read', so an
// undirected tally would report 2,713 delivered against 2,704 sent.
const OCTOBER = [
  { direction: 'outbound', status: 'read',      cnt: 2274 },
  { direction: 'outbound', status: 'delivered', cnt: 371 },
  { direction: 'outbound', status: 'sent',      cnt: 59 },
  { direction: 'outbound', status: 'failed',    cnt: 13 },
  { direction: 'inbound',  status: 'delivered', cnt: 2342 },
];

describe('tallyMessageStatuses', () => {
  it('keeps the directions apart', () => {
    expect(tallyMessageStatuses(OCTOBER, 'outbound'))
      .toEqual({ queued: 0, sent: 59, delivered: 371, read: 2274, failed: 13 });
    expect(tallyMessageStatuses(OCTOBER, 'inbound'))
      .toEqual({ queued: 0, sent: 0, delivered: 2342, read: 0, failed: 0 });
  });

  it('returns zeros, not undefined, for a status with no rows', () => {
    const tally = tallyMessageStatuses([], 'outbound');
    expect(tally.queued).toBe(0);
    expect(Object.values(tally).every((n) => n === 0)).toBe(true);
  });

  it('survives null data and null fields', () => {
    expect(tallyMessageStatuses(null, 'outbound').read).toBe(0);
    expect(tallyMessageStatuses([{ direction: null, status: null, cnt: null }], 'outbound').read).toBe(0);
  });

  // A status outside the enum must not be silently folded into a bucket it does
  // not belong to — the old counts named the statuses they wanted, and so does this.
  it('drops a status it does not recognise', () => {
    const tally = tallyMessageStatuses(
      [...OCTOBER, { direction: 'outbound', status: 'deleted', cnt: 9999 }], 'outbound');
    expect(tally.read).toBe(2274);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(2717);
  });

  it('counts a cnt that arrives as a string', () => {
    expect(tallyMessageStatuses([{ direction: 'outbound', status: 'read', cnt: '2274' }], 'outbound').read)
      .toBe(2274);
  });
});

describe('outboundDeliveryFunnel', () => {
  // The numbers the four replaced counts returned, verified against production.
  it('reproduces what the per-bucket counts returned', () => {
    const funnel = outboundDeliveryFunnel(tallyMessageStatuses(OCTOBER, 'outbound'));
    expect(funnel).toEqual({ queued: 0, sent: 2704, delivered: 2645, read: 2274, failed: 13 });
  });

  it('is cumulative: a read message was also delivered and sent', () => {
    const funnel = outboundDeliveryFunnel(
      tallyMessageStatuses([{ direction: 'outbound', status: 'read', cnt: 1 }], 'outbound'));
    expect(funnel.sent).toBe(1);
    expect(funnel.delivered).toBe(1);
    expect(funnel.read).toBe(1);
  });

  // failed is terminal and sits outside the funnel: a message that failed was
  // never delivered, so counting it as sent would overstate the denominator the
  // delivery rate is drawn against.
  it('leaves failed out of sent and delivered', () => {
    const funnel = outboundDeliveryFunnel(
      tallyMessageStatuses([{ direction: 'outbound', status: 'failed', cnt: 7 }], 'outbound'));
    expect(funnel).toEqual({ queued: 0, sent: 0, delivered: 0, read: 0, failed: 7 });
  });

  // queued has not been handed to Meta yet, so it is not part of sent either.
  it('leaves queued out of sent', () => {
    const funnel = outboundDeliveryFunnel(
      tallyMessageStatuses([{ direction: 'outbound', status: 'queued', cnt: 4 }], 'outbound'));
    expect(funnel.sent).toBe(0);
    expect(funnel.queued).toBe(4);
  });
});

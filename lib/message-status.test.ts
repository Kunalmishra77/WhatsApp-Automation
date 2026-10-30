import { describe, it, expect } from 'vitest';
import { priorStatusesFor, isMessageStatus, MESSAGE_STATUS_RANK } from './message-status';

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

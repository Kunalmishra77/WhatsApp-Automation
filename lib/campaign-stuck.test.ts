import { describe, it, expect } from 'vitest';
import { isRunStuck, STUCK_AFTER_MS } from './campaign-stuck';

const NOW = new Date('2026-10-31T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;

describe('isRunStuck', () => {
  it('leaves a run that started recently alone', () => {
    expect(isRunStuck({ startedAt: ago(5 * MIN), lastSentAt: null, now: NOW })).toBe(false);
  });

  // The case the old test got wrong, and the whole reason this exists. Every
  // large campaign on this platform runs for hours.
  it('leaves a long run that is still sending alone', () => {
    expect(isRunStuck({
      startedAt: ago(118 * MIN),   // '22-24 Delivred Data', 18,449 recipients
      lastSentAt: ago(30_000),
      now: NOW,
    })).toBe(false);

    expect(isRunStuck({
      startedAt: ago(2910 * MIN),  // 'All 25-26', 48 hours
      lastSentAt: ago(2 * MIN),
      now: NOW,
    })).toBe(false);
  });

  it('resets a long run that has gone silent', () => {
    expect(isRunStuck({ startedAt: ago(60 * MIN), lastSentAt: ago(25 * MIN), now: NOW })).toBe(true);
  });

  // Stuck resolving its audience: 18,000 recipients is minutes of queries, but
  // not twenty.
  it('resets a long run that has sent nothing at all', () => {
    expect(isRunStuck({ startedAt: ago(60 * MIN), lastSentAt: null, now: NOW })).toBe(true);
  });

  it('is exact at the boundary', () => {
    // Started exactly on the cutoff counts as recent.
    expect(isRunStuck({ startedAt: ago(STUCK_AFTER_MS), lastSentAt: null, now: NOW })).toBe(true);
    expect(isRunStuck({ startedAt: ago(STUCK_AFTER_MS - 1), lastSentAt: null, now: NOW })).toBe(false);
    // A heartbeat exactly on the cutoff is not recent enough.
    expect(isRunStuck({ startedAt: ago(60 * MIN), lastSentAt: ago(STUCK_AFTER_MS), now: NOW })).toBe(true);
    expect(isRunStuck({ startedAt: ago(60 * MIN), lastSentAt: ago(STUCK_AFTER_MS - 1), now: NOW })).toBe(false);
  });

  it('is not its business when the job is not processing', () => {
    expect(isRunStuck({ startedAt: null, lastSentAt: null, now: NOW })).toBe(false);
  });

  // Resetting a dead run costs a resumed campaign, and the dedup covers what it
  // already sent. Trusting a bad value costs a second live run.
  it('treats an unreadable timestamp as no heartbeat, not a recent one', () => {
    expect(isRunStuck({ startedAt: ago(60 * MIN), lastSentAt: 'not a date', now: NOW })).toBe(true);
  });

  it('does not reset on an unreadable start time', () => {
    expect(isRunStuck({ startedAt: 'not a date', lastSentAt: null, now: NOW })).toBe(false);
  });

  it('does not reset a run whose heartbeat is in the future', () => {
    expect(isRunStuck({ startedAt: ago(60 * MIN), lastSentAt: new Date(NOW.getTime() + MIN).toISOString(), now: NOW }))
      .toBe(false);
  });
});

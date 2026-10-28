import { describe, it, expect } from 'vitest';
import { computeWakeAt } from './wait';

// IST is UTC+05:30 with no daylight saving, so these are exact.
const at = (iso: string) => new Date(iso);
const mins = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60000);

describe('computeWakeAt — durations', () => {
  const now = at('2026-10-28T06:00:00.000Z');

  it('adds minutes, hours and days together', () => {
    expect(mins(now, computeWakeAt({ days: 1, hours: 2, minutes: 30 }, now)))
      .toBe(24 * 60 + 150);
  });

  it('treats a bare hours value as a duration without a mode', () => {
    expect(mins(now, computeWakeAt({ hours: 2 }, now))).toBe(120);
  });

  // A zero wait would resume before the cron could ever see the row, which would
  // make the node a no-op instead of a pause.
  it('never schedules less than a minute out', () => {
    expect(mins(now, computeWakeAt({}, now))).toBe(1);
    expect(mins(now, computeWakeAt({ minutes: 0 }, now))).toBe(1);
    expect(mins(now, computeWakeAt({ minutes: -60 }, now))).toBe(1);
  });
});

describe('computeWakeAt — clock times', () => {
  it('picks today when the time is still ahead in IST', () => {
    // 06:00 UTC = 11:30 IST, so 18:00 IST is later the same day.
    const now = at('2026-10-28T06:00:00.000Z');
    expect(computeWakeAt({ mode: 'time', atTime: '18:00' }, now).toISOString())
      .toBe('2026-10-28T12:30:00.000Z');
  });

  it('rolls to tomorrow when the time has passed in IST', () => {
    // 14:00 UTC = 19:30 IST, so 10:00 IST is already gone.
    const now = at('2026-10-28T14:00:00.000Z');
    expect(computeWakeAt({ mode: 'time', atTime: '10:00' }, now).toISOString())
      .toBe('2026-10-29T04:30:00.000Z');
  });

  // The IST calendar day runs ahead of UTC's, which is exactly where a naive
  // implementation sends a 09:00 reminder out a day late.
  it('uses the IST calendar day, not the UTC one', () => {
    // 20:00 UTC on the 28th is already 01:30 IST on the 29th.
    const now = at('2026-10-28T20:00:00.000Z');
    expect(computeWakeAt({ mode: 'time', atTime: '09:00' }, now).toISOString())
      .toBe('2026-10-29T03:30:00.000Z');
  });

  it('waits for the named weekday', () => {
    // 2026-10-28 is a Wednesday; weekday 1 is the following Monday.
    const now = at('2026-10-28T06:00:00.000Z');
    const wake = computeWakeAt({ mode: 'time', atTime: '10:00', weekday: 1 }, now);
    expect(wake.toISOString()).toBe('2026-11-02T04:30:00.000Z');
    // Confirm it really is Monday in IST, not in UTC.
    expect(new Date(wake.getTime() + 330 * 60000).getUTCDay()).toBe(1);
  });

  it('falls back to a duration when the time is malformed', () => {
    const now = at('2026-10-28T06:00:00.000Z');
    expect(mins(now, computeWakeAt({ mode: 'time', atTime: '25h', hours: 3 }, now))).toBe(180);
  });
});

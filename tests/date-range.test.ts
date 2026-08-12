// tests/date-range.test.ts
import { describe, it, expect } from 'vitest';
import { resolveRange, todayInTz, addDays, zonedDayStartUtc, QUICK_RANGES } from '@/lib/date-range';

const IST = 'Asia/Kolkata';

describe('helpers', () => {
  it('todayInTz maps a 02:00 IST instant to the correct local day', () => {
    // 2026-08-11T20:35Z == 2026-08-12T02:05 IST → local day is the 12th, not the 11th
    expect(todayInTz(new Date('2026-08-11T20:35:00Z'), IST)).toBe('2026-08-12');
    // 2026-08-11T18:00Z == 2026-08-11T23:30 IST → still the 11th
    expect(todayInTz(new Date('2026-08-11T18:00:00Z'), IST)).toBe('2026-08-11');
  });
  it('addDays does calendar math across month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('zonedDayStartUtc returns IST local midnight as the prior-day 18:30 UTC', () => {
    expect(zonedDayStartUtc('2026-08-12', IST)).toBe('2026-08-11T18:30:00.000Z');
  });
});

describe('resolveRange (IST)', () => {
  const now = new Date('2026-08-11T06:00:00Z'); // 2026-08-11 11:30 IST
  it('today', () => {
    const r = resolveRange('today', { tz: IST, now });
    expect(r.from).toBe('2026-08-11'); expect(r.to).toBe('2026-08-11');
    expect(r.fromUtc).toBe('2026-08-10T18:30:00.000Z');
    expect(r.toUtc).toBe('2026-08-11T18:30:00.000Z'); // exclusive
  });
  it('yesterday', () => {
    const r = resolveRange('yesterday', { tz: IST, now });
    expect(r.from).toBe('2026-08-10'); expect(r.to).toBe('2026-08-10');
  });
  it('last_7_days is 7 inclusive days ending today', () => {
    const r = resolveRange('last_7_days', { tz: IST, now });
    expect(r.from).toBe('2026-08-05'); expect(r.to).toBe('2026-08-11');
  });
  it('this_week starts Monday', () => {
    const r = resolveRange('this_week', { tz: IST, now }); // 2026-08-11 is a Tuesday
    expect(r.from).toBe('2026-08-10'); expect(r.to).toBe('2026-08-11');
  });
  it('last_week is the prior Mon–Sun', () => {
    const r = resolveRange('last_week', { tz: IST, now });
    expect(r.from).toBe('2026-08-03'); expect(r.to).toBe('2026-08-09');
  });
  it('this_month', () => {
    const r = resolveRange('this_month', { tz: IST, now });
    expect(r.from).toBe('2026-08-01'); expect(r.to).toBe('2026-08-11');
  });
  it('this_quarter (Q3 = Jul–Sep)', () => {
    const r = resolveRange('this_quarter', { tz: IST, now });
    expect(r.from).toBe('2026-07-01'); expect(r.to).toBe('2026-08-11');
  });
  it('this_half_year (H2 = Jul–Dec)', () => {
    const r = resolveRange('this_half_year', { tz: IST, now });
    expect(r.from).toBe('2026-07-01');
  });
  it('this_year', () => {
    const r = resolveRange('this_year', { tz: IST, now });
    expect(r.from).toBe('2026-01-01'); expect(r.to).toBe('2026-08-11');
  });
  it('all_time uses epoch → now+', () => {
    const r = resolveRange('all_time', { tz: IST, now });
    expect(r.fromUtc).toBe('1970-01-01T00:00:00.000Z');
    expect(new Date(r.toUtc).getTime()).toBeGreaterThan(now.getTime());
  });
  it('custom uses provided local days', () => {
    const r = resolveRange('custom', { tz: IST, now, from: '2026-07-01', to: '2026-07-31' });
    expect(r.from).toBe('2026-07-01'); expect(r.to).toBe('2026-07-31');
    expect(r.toUtc).toBe('2026-07-31T18:30:00.000Z'); // start of Aug 1 IST
  });
  it('QUICK_RANGES excludes custom and lists all quick keys', () => {
    expect(QUICK_RANGES.some(q => q.key === 'custom')).toBe(false);
    expect(QUICK_RANGES.length).toBeGreaterThanOrEqual(17);
  });
});

describe('resolveRange (IST) — year rollover', () => {
  // 2027-01-15T06:00Z == 2027-01-15 11:30 IST (a Friday)
  const now = new Date('2027-01-15T06:00:00Z');

  it('last_month crosses into prior December of prior year', () => {
    const r = resolveRange('last_month', { tz: IST, now });
    expect(r.from).toBe('2026-12-01'); expect(r.to).toBe('2026-12-31');
  });
  it('last_quarter crosses into Q4 of prior year', () => {
    const r = resolveRange('last_quarter', { tz: IST, now });
    expect(r.from).toBe('2026-10-01'); expect(r.to).toBe('2026-12-31');
  });
  it('last_half_year crosses into H2 of prior year', () => {
    const r = resolveRange('last_half_year', { tz: IST, now });
    expect(r.from).toBe('2026-07-01'); expect(r.to).toBe('2026-12-31');
  });
  it('last_year is the prior calendar year', () => {
    const r = resolveRange('last_year', { tz: IST, now });
    expect(r.from).toBe('2026-01-01'); expect(r.to).toBe('2026-12-31');
  });
  it('this_quarter in January is Q1', () => {
    const r = resolveRange('this_quarter', { tz: IST, now });
    expect(r.from).toBe('2027-01-01'); expect(r.to).toBe('2027-01-15');
  });
  it('this_half_year in January is H1', () => {
    const r = resolveRange('this_half_year', { tz: IST, now });
    expect(r.from).toBe('2027-01-01'); expect(r.to).toBe('2027-01-15');
  });
  it('last_30_days spans the December/January boundary', () => {
    const r = resolveRange('last_30_days', { tz: IST, now });
    expect(r.from).toBe('2026-12-17'); expect(r.to).toBe('2027-01-15');
  });
});

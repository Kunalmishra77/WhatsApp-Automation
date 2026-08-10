import { describe, expect, it } from 'vitest';
import { dayFromBucket, parsePricingAnalytics, resolveRange, sumCost, pctChange, bucketSeries } from '../lib/meta-spend';

describe('dayFromBucket', () => {
  it('uses the bucket midpoint UTC date', () => {
    // an IST-midnight bucket: 2026-08-01 00:00 IST = 2026-07-31 18:30 UTC; +12h midpoint = 2026-08-01 06:30 UTC
    const start = Math.floor(Date.parse('2026-07-31T18:30:00Z') / 1000);
    const end = start + 24 * 3600;
    expect(dayFromBucket(start, end)).toBe('2026-08-01');
  });
});

describe('parsePricingAnalytics', () => {
  it('normalizes data points to rows', () => {
    const json = { data: [{ data_points: [
      { start: Math.floor(Date.parse('2026-08-01T00:00:00Z')/1000), end: Math.floor(Date.parse('2026-08-02T00:00:00Z')/1000), pricing_category: 'MARKETING', volume: 100, cost: 58.5 },
    ] }] };
    const rows = parsePricingAnalytics(json, 'INR');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'MARKETING', volume: 100, cost: 58.5, currency: 'INR' });
    expect(rows[0]!.day).toBe('2026-08-01');
  });
  it('returns [] for malformed input', () => {
    expect(parsePricingAnalytics({}, 'INR')).toEqual([]);
    expect(parsePricingAnalytics({ data: [{}] }, 'INR')).toEqual([]);
  });
});

describe('resolveRange', () => {
  const now = new Date('2026-08-10T09:00:00Z');
  it('today', () => expect(resolveRange('today', now)).toEqual({ from: '2026-08-10', to: '2026-08-10' }));
  it('yesterday', () => expect(resolveRange('yesterday', now)).toEqual({ from: '2026-08-09', to: '2026-08-09' }));
  it('last_7_days', () => expect(resolveRange('last_7_days', now)).toEqual({ from: '2026-08-04', to: '2026-08-10' }));
  it('this_month', () => expect(resolveRange('this_month', now)).toEqual({ from: '2026-08-01', to: '2026-08-10' }));
  it('unknown falls back to last_30_days', () => expect(resolveRange('nonsense', now)).toEqual({ from: '2026-07-12', to: '2026-08-10' }));
});

describe('sumCost / pctChange', () => {
  const rows = [
    { day: '2026-08-01', category: 'MARKETING', volume: 1, cost: 10, currency: 'INR' },
    { day: '2026-08-02', category: 'UTILITY', volume: 1, cost: 5, currency: 'INR' },
    { day: '2026-08-05', category: 'MARKETING', volume: 1, cost: 20, currency: 'INR' },
  ];
  it('sums within an inclusive range', () => {
    expect(sumCost(rows, '2026-08-01', '2026-08-02')).toBe(15);
    expect(sumCost(rows, '2026-08-01', '2026-08-05')).toBe(35);
  });
  it('pctChange handles zero previous', () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(15, 10)).toBe(50);
  });
});

describe('bucketSeries', () => {
  const rows = [
    { day: '2026-08-01', category: 'MARKETING', volume: 1, cost: 10, currency: 'INR' },
    { day: '2026-08-01', category: 'UTILITY', volume: 1, cost: 5, currency: 'INR' },
    { day: '2026-08-02', category: 'MARKETING', volume: 1, cost: 7, currency: 'INR' },
  ];
  it('buckets by day, summing categories', () => {
    const s = bucketSeries(rows, '2026-08-01', '2026-08-02', 'day');
    expect(s).toEqual([{ label: '2026-08-01', cost: 15 }, { label: '2026-08-02', cost: 7 }]);
  });
});

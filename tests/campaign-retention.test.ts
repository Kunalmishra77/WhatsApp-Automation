import { describe, expect, it } from 'vitest';
import { computeRetention } from '../lib/campaign-retention';

const iso = (d: Date) => d.toISOString();
function daysAgo(n: number): string { const d = new Date('2026-08-09T00:00:00Z'); d.setDate(d.getDate() - n); return iso(d); }
const NOW = new Date('2026-08-09T00:00:00Z');

describe('computeRetention', () => {
  it('active well before the 2-month mark', () => {
    const r = computeRetention({ created_at: daysAgo(200), completed_at: daysAgo(10), data_deleted_at: null }, NOW);
    expect(r.status).toBe('active');
    expect(r.daysRemaining).toBeGreaterThan(7);
  });
  it('expiring within 7 days of retention_at', () => {
    // completed ~ (2 months - 3 days) ago → retention_at ~3 days out
    const base = new Date(NOW); base.setMonth(base.getMonth() - 2); base.setDate(base.getDate() + 3);
    const r = computeRetention({ created_at: iso(base), completed_at: iso(base), data_deleted_at: null }, NOW);
    expect(r.status).toBe('expiring');
    expect(r.daysRemaining).toBeLessThanOrEqual(7);
    expect(r.daysRemaining).toBeGreaterThanOrEqual(0);
  });
  it('expired at/after retention_at', () => {
    const base = new Date(NOW); base.setMonth(base.getMonth() - 3);
    const r = computeRetention({ created_at: iso(base), completed_at: iso(base), data_deleted_at: null }, NOW);
    expect(r.status).toBe('expired');
    expect(r.daysRemaining).toBeLessThan(0);
  });
  it('deleted when data_deleted_at is set (regardless of dates)', () => {
    const r = computeRetention({ created_at: daysAgo(400), completed_at: null, data_deleted_at: daysAgo(1) }, NOW);
    expect(r.status).toBe('deleted');
  });
  it('falls back to created_at when completed_at is null', () => {
    const base = new Date(NOW); base.setMonth(base.getMonth() - 3);
    const r = computeRetention({ created_at: iso(base), completed_at: null, data_deleted_at: null }, NOW);
    expect(r.status).toBe('expired');
  });
});

import { describe, it, expect } from 'vitest';
import { computeGbpReport, type GbpSignals } from '@/lib/gbp-report';

const base: GbpSignals = {
  name: 'Test Biz', rating: 4.6, reviewCount: 60, hasWebsite: true, hasPhone: true,
  hasHours: true, photoCount: 12, hasDescription: true, isOperational: true,
};

describe('computeGbpReport', () => {
  it('gives a complete profile a top grade', () => {
    const r = computeGbpReport(base);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.grade).toBe('A');
    expect(r.findings.every((f) => f.ok)).toBe(true);
  });

  it('penalises a bare profile', () => {
    const r = computeGbpReport({
      name: 'Bare', rating: null, reviewCount: 0, hasWebsite: false, hasPhone: false,
      hasHours: false, photoCount: 0, hasDescription: false, isOperational: true,
    });
    expect(r.score).toBeLessThan(20);
    expect(r.grade).toBe('D');
    expect(r.findings.find((f) => f.key === 'website')?.ok).toBe(false);
  });

  it('flags missing website/hours with actionable tips', () => {
    const r = computeGbpReport({ ...base, hasWebsite: false, hasHours: false });
    expect(r.findings.find((f) => f.key === 'website')?.ok).toBe(false);
    expect(r.findings.find((f) => f.key === 'hours')?.ok).toBe(false);
    expect(r.score).toBeLessThan(85);
  });

  it('drops the score when not operational', () => {
    const open = computeGbpReport(base).score;
    const closed = computeGbpReport({ ...base, isOperational: false }).score;
    expect(closed).toBeLessThan(open);
  });

  it('clamps score to 0..100', () => {
    const r = computeGbpReport(base);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

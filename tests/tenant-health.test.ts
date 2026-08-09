import { describe, expect, it } from 'vitest';
import { classifyTenant, diffNewlySilent, type TenantStatus } from '../lib/tenant-health';

describe('classifyTenant', () => {
  it('silent: active, established baseline, zero recent', () => {
    expect(classifyTenant({ is_active: true, baseline_count: 40, recent_count: 0 })).toBe('silent');
    expect(classifyTenant({ is_active: true, baseline_count: 20, recent_count: 0 })).toBe('silent'); // boundary: exactly 20
  });
  it('ok: inactive workspace never flagged', () => {
    expect(classifyTenant({ is_active: false, baseline_count: 100, recent_count: 0 })).toBe('ok');
  });
  it('ok: not established (baseline below floor)', () => {
    expect(classifyTenant({ is_active: true, baseline_count: 19, recent_count: 0 })).toBe('ok');
  });
  it('ok: still receiving inbound', () => {
    expect(classifyTenant({ is_active: true, baseline_count: 40, recent_count: 1 })).toBe('ok');
  });
});

describe('diffNewlySilent', () => {
  const cur = (m: Record<string, TenantStatus>) =>
    Object.entries(m).map(([workspace_id, status]) => ({ workspace_id, status }));
  it('flags ok→silent and no-prior→silent, excludes still-silent and recovered', () => {
    const prev = new Map<string, TenantStatus>([['a', 'ok'], ['b', 'silent'], ['d', 'silent']]);
    const current = cur({ a: 'silent', b: 'silent', c: 'silent', d: 'ok' });
    // a: ok→silent ✓, b: still-silent ✗, c: no-prior→silent ✓, d: recovered ✗
    expect(diffNewlySilent(prev, current).sort()).toEqual(['a', 'c']);
  });
  it('empty when nothing newly silent', () => {
    const prev = new Map<string, TenantStatus>([['a', 'silent']]);
    expect(diffNewlySilent(prev, cur({ a: 'silent' }))).toEqual([]);
  });
});

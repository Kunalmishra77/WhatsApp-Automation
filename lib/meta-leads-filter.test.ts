import { describe, it, expect } from 'vitest';
import { platformFilter, applyPlatformFilter, isAdPlatform } from './meta-leads-filter';

describe('isAdPlatform', () => {
  it('accepts the two platforms', () => {
    expect(isAdPlatform('facebook')).toBe(true);
    expect(isAdPlatform('instagram')).toBe(true);
  });

  it('rejects anything else, including nothing', () => {
    expect(isAdPlatform(null)).toBe(false);
    expect(isAdPlatform(undefined)).toBe(false);
    expect(isAdPlatform('')).toBe(false);
    expect(isAdPlatform('whatsapp')).toBe(false);
    expect(isAdPlatform('Facebook')).toBe(false);
  });
});

describe('platformFilter', () => {
  it('adds nothing when no platform is asked for', () => {
    expect(platformFilter(null)).toEqual({ kind: 'none' });
    expect(platformFilter('')).toEqual({ kind: 'none' });
  });

  // A value the UI cannot produce must not silently become "no filter on a
  // column that exists" — it becomes no filter at all, which is what the
  // unfiltered list already shows.
  it('adds nothing for a platform it does not know', () => {
    expect(platformFilter('tiktok')).toEqual({ kind: 'none' });
  });

  it('filters instagram on the stored value', () => {
    expect(platformFilter('instagram')).toEqual({
      kind: 'eq', column: 'meta->ad_source->>platform', value: 'instagram',
    });
  });

  // The wrinkle. The page displays `adSource.platform ?? 'facebook'`, so a lead
  // with no platform stored is shown as facebook — and filtering it out would
  // hide a row the same page labels facebook, which reads as the lead
  // vanishing.
  it('includes leads with no platform stored when filtering facebook', () => {
    const filter = platformFilter('facebook');
    expect(filter.kind).toBe('or');
    expect(filter).toHaveProperty('expression',
      'meta->ad_source->>platform.eq.facebook,meta->ad_source->>platform.is.null');
  });
});

describe('applyPlatformFilter', () => {
  // A stand-in for the Supabase builder, recording what was asked of it.
  const builder = () => {
    const calls: string[] = [];
    const q = {
      calls,
      eq(column: string, value: string) { calls.push(`eq:${column}=${value}`); return q; },
      or(expression: string) { calls.push(`or:${expression}`); return q; },
    };
    return q;
  };

  it('leaves the query untouched with no platform', () => {
    const q = builder();
    expect(applyPlatformFilter(q, null)).toBe(q);
    expect(q.calls).toEqual([]);
  });

  it('adds one eq for instagram', () => {
    const q = builder();
    applyPlatformFilter(q, 'instagram');
    expect(q.calls).toEqual(['eq:meta->ad_source->>platform=instagram']);
  });

  it('adds one or for facebook', () => {
    const q = builder();
    applyPlatformFilter(q, 'facebook');
    expect(q.calls).toEqual([
      'or:meta->ad_source->>platform.eq.facebook,meta->ad_source->>platform.is.null',
    ]);
  });

  it('returns the builder so it can be chained', () => {
    const q = builder();
    expect(applyPlatformFilter(q, 'facebook')).toBe(q);
  });
});

import { describe, it, expect } from 'vitest';
import { starRatingToInt, GBP_SCOPE } from '@/lib/google-business';

describe('starRatingToInt', () => {
  it('maps Google enum ratings to 1..5', () => {
    expect(starRatingToInt('ONE')).toBe(1);
    expect(starRatingToInt('TWO')).toBe(2);
    expect(starRatingToInt('THREE')).toBe(3);
    expect(starRatingToInt('FOUR')).toBe(4);
    expect(starRatingToInt('FIVE')).toBe(5);
  });

  it('returns null for missing/unknown ratings', () => {
    expect(starRatingToInt(null)).toBeNull();
    expect(starRatingToInt(undefined)).toBeNull();
    expect(starRatingToInt('STAR_RATING_UNSPECIFIED')).toBeNull();
    expect(starRatingToInt('')).toBeNull();
  });
});

describe('GBP_SCOPE', () => {
  it('is the business.manage scope', () => {
    expect(GBP_SCOPE).toBe('https://www.googleapis.com/auth/business.manage');
  });
});

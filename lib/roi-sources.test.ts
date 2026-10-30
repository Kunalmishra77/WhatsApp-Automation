import { describe, it, expect } from 'vitest';
import { describeSource, adSpendIsMeasured, summariseSources } from './roi-sources';

const META_OFF = describeSource('meta_ads', false, false);
const GOOGLE_OFF = describeSource('google_ads', false, false);
const META_ON = describeSource('meta_ads', true, true);
const GOOGLE_ON_EMPTY = describeSource('google_ads', true, false);

describe('describeSource', () => {
  it('notes an unconnected source', () => {
    expect(META_OFF.connected).toBe(false);
    expect(META_OFF.note).toContain('not connected');
    expect(META_OFF.label).toBe('Meta Ads');
  });

  // Connected and nothing spent is a real measurement. ₹0 is true here, so
  // there is nothing to explain.
  it('says nothing about a connected source with no spend', () => {
    expect(GOOGLE_ON_EMPTY.note).toBeNull();
    expect(GOOGLE_ON_EMPTY.connected).toBe(true);
    expect(GOOGLE_ON_EMPTY.hasSpend).toBe(false);
  });

  it('says nothing about a connected source with spend', () => {
    expect(META_ON.note).toBeNull();
  });
});

describe('adSpendIsMeasured', () => {
  // The distinction the page turns on: the platform has not measured ₹0, it
  // has measured nothing.
  it('is false when no source is connected', () => {
    expect(adSpendIsMeasured([META_OFF, GOOGLE_OFF])).toBe(false);
  });

  it('is true as soon as one is', () => {
    expect(adSpendIsMeasured([META_OFF, GOOGLE_ON_EMPTY])).toBe(true);
  });

  it('is false with no sources at all, rather than throwing', () => {
    expect(adSpendIsMeasured([])).toBe(false);
  });
});

describe('summariseSources', () => {
  // Today's real state: fifteen workspaces, none with an ad account.
  it('explains the whole figure when nothing is connected', () => {
    const line = summariseSources([META_OFF, GOOGLE_OFF])!;
    expect(line).toContain('No ad account is connected');
    expect(line).toContain('Meta Ads and Google Ads');
    expect(line).toContain('Settings');
  });

  it('names only what is missing when one is connected', () => {
    const line = summariseSources([META_OFF, GOOGLE_ON_EMPTY])!;
    expect(line).toBe('Meta Ads is not connected, so its spend is missing from these figures.');
  });

  it('uses plural wording for two missing of three', () => {
    const third = describeSource('google_ads', true, true);
    const line = summariseSources([META_OFF, { ...GOOGLE_OFF, key: 'google_ads' }, third])!;
    expect(line).toContain('are not connected');
    expect(line).toContain('their spend');
  });

  // An explanation nobody needs is noise, and noise is how the explanations
  // that matter get skipped.
  it('says nothing when everything is connected', () => {
    expect(summariseSources([META_ON, GOOGLE_ON_EMPTY])).toBeNull();
  });

  it('says nothing when there are no sources', () => {
    expect(summariseSources([])).toBeNull();
  });
});

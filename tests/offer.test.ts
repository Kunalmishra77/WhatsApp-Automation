import { describe, expect, it } from 'vitest';
import {
  parseActiveOffer, computeOfferStatus, buildOfferBlock, pricingBlockForSettings,
  extractMoneyAmounts, findConflictingAmounts, validateOfferInput, isValidDate,
} from '../lib/offer';

const OFFER = { name: 'Monsoon Offer', details: 'Buy 1 Year for ₹75,000, get 1 Year FREE.', valid_from: '2026-08-04', valid_until: '2026-08-31' };

describe('parseActiveOffer', () => {
  it('returns null when absent or invalid', () => {
    expect(parseActiveOffer(null)).toBeNull();
    expect(parseActiveOffer({})).toBeNull();
    expect(parseActiveOffer({ active_offer: { name: '', details: 'x' } })).toBeNull();
  });
  it('parses a valid offer and drops malformed dates', () => {
    const o = parseActiveOffer({ active_offer: { ...OFFER, valid_from: 'bad' } });
    expect(o?.name).toBe('Monsoon Offer');
    expect(o?.valid_from).toBeUndefined();
    expect(o?.valid_until).toBe('2026-08-31');
  });
  it('drops a calendar-invalid valid_until (format-valid but not a real date)', () => {
    const o = parseActiveOffer({ active_offer: { name: 'X', details: 'Y', valid_until: '2026-02-30' } });
    expect(o?.valid_until).toBeUndefined();
  });
});

describe('computeOfferStatus', () => {
  const o = parseActiveOffer({ active_offer: OFFER })!;
  it('none when no offer', () => expect(computeOfferStatus(null, '2026-08-10')).toBe('none'));
  it('active inside window', () => expect(computeOfferStatus(o, '2026-08-10')).toBe('active'));
  it('scheduled before valid_from', () => expect(computeOfferStatus(o, '2026-08-01')).toBe('scheduled'));
  it('expired after valid_until', () => expect(computeOfferStatus(o, '2026-09-01')).toBe('expired'));
  it('evergreen active when no valid_until', () => {
    const ev = parseActiveOffer({ active_offer: { name: 'X', details: 'Y' } })!;
    expect(computeOfferStatus(ev, '2030-01-01')).toBe('active');
  });
});

describe('buildOfferBlock', () => {
  const o = parseActiveOffer({ active_offer: OFFER })!;
  it('active block contains offer + override language', () => {
    const b = buildOfferBlock(o, 'active');
    expect(b).toContain('CURRENT OFFER');
    expect(b).toContain('₹75,000');
    expect(b).toContain('Valid until 2026-08-31');
    expect(b).toMatch(/ONLY price/i);
  });
  it('expired/scheduled yields guard, none yields empty', () => {
    expect(buildOfferBlock(o, 'expired')).toMatch(/no active offer/i);
    expect(buildOfferBlock(o, 'scheduled')).toMatch(/no active offer/i);
    expect(buildOfferBlock(null, 'none')).toBe('');
  });
});

describe('pricingBlockForSettings', () => {
  it('none settings → empty (backward compatible)', () => {
    expect(pricingBlockForSettings({}, '2026-08-10')).toBe('');
  });
  it('active offer → offer block', () => {
    expect(pricingBlockForSettings({ active_offer: OFFER }, '2026-08-10')).toContain('₹75,000');
  });
});

describe('extractMoneyAmounts / findConflictingAmounts', () => {
  it('extracts ₹/Rs/INR amounts, ignores bare numbers', () => {
    expect(extractMoneyAmounts('₹75,000 and Rs 27,450 and INR 55950')).toEqual(['75000', '27450', '55950']);
    expect(extractMoneyAmounts('call 9876543210 at 9-5')).toEqual([]);
  });
  it('returns KB amounts not present in the offer', () => {
    const out = findConflictingAmounts('Only ₹75,000', ['3 Months ₹27,450', '12 Months ₹55,950', 'best ₹75,000']);
    expect(out).toContain('₹27,450');
    expect(out).toContain('₹55,950');
    expect(out).not.toContain('₹75,000');
  });
});

describe('validateOfferInput', () => {
  it('rejects missing name/details and bad dates', () => {
    expect(validateOfferInput({ details: 'x' }).ok).toBe(false);
    expect(validateOfferInput({ name: 'A', details: 'B', valid_until: '31-08-2026' }).ok).toBe(false);
    expect(validateOfferInput({ name: 'A', details: 'B', valid_from: '2026-08-31', valid_until: '2026-08-01' }).ok).toBe(false);
  });
  it('rejects calendar-invalid dates that pass the YYYY-MM-DD format regex', () => {
    expect(validateOfferInput({ name: 'A', details: 'B', valid_until: '2026-13-40' }).ok).toBe(false);
    expect(validateOfferInput({ name: 'A', details: 'B', valid_until: '2026-02-30' }).ok).toBe(false);
  });
  it('accepts a valid offer and trims', () => {
    const r = validateOfferInput({ name: '  Monsoon  ', details: '  ₹75,000  ' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.offer.name).toBe('Monsoon'); expect(r.offer.details).toBe('₹75,000'); }
  });
  it('accepts a valid calendar date', () => {
    const r = validateOfferInput({ name: 'A', details: 'B', valid_until: '2026-08-31' });
    expect(r.ok).toBe(true);
  });
  it('rejects a name longer than 120 characters', () => {
    expect(validateOfferInput({ name: 'x'.repeat(121), details: 'y' }).ok).toBe(false);
  });
  it('accepts a name exactly 120 characters', () => {
    const r = validateOfferInput({ name: 'x'.repeat(120), details: 'y' });
    expect(r.ok).toBe(true);
  });
});

describe('isValidDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDate('2026-08-31')).toBe(true);
    expect(isValidDate('2024-02-29')).toBe(true); // leap year
  });
  it('rejects format-valid but calendar-invalid dates', () => {
    expect(isValidDate('2026-13-40')).toBe(false);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2023-02-29')).toBe(false); // not a leap year
  });
  it('rejects malformed strings', () => {
    expect(isValidDate('31-08-2026')).toBe(false);
    expect(isValidDate('bad')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });
});

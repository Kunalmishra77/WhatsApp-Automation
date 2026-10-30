import { describe, expect, it } from 'vitest';
import {
  parseActiveOffer, computeOfferStatus, buildOfferBlock, pricingBlockForSettings,
  extractMoneyAmounts, findConflictingAmounts, validateOfferInput, isValidDate,
  offerReadinessForCampaign, offerAlertForSettings, daysBetweenISO, formatOfferDate,
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
  // An ended offer must stop being quoted without taking the business's own
  // prices down with it. The previous rule told the bot to quote no number at
  // all, which left VMS answering every price question with "a team member will
  // share pricing shortly" for the seven weeks after its event offer ended.
  it('expired offer is withdrawn but pricing still comes from the business', () => {
    const b = buildOfferBlock(o, 'expired');
    expect(b).toContain('Monsoon Offer');
    expect(b).toMatch(/has ended/i);
    expect(b).toMatch(/knowledge base/i);
    expect(b).not.toContain('₹75,000');
  });
  it('a scheduled offer is not advertised early', () => {
    const b = buildOfferBlock(o, 'scheduled');
    expect(b).toMatch(/has not started yet/i);
    expect(b).not.toContain('₹75,000');
  });
  it('none yields empty', () => {
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
    const r = validateOfferInput({ name: '  Monsoon  ', details: '  ₹75,000  ', valid_until: '2026-08-31' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.offer.name).toBe('Monsoon'); expect(r.offer.details).toBe('₹75,000'); }
  });
  // An offer with no end date never retires, and while it is live it is the only
  // price the bot may quote. Thames ran one into late October.
  it('rejects an offer with no end date', () => {
    const r = validateOfferInput({ name: 'A', details: 'B' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/valid_until is required/);
  });
  it('accepts a valid calendar date', () => {
    const r = validateOfferInput({ name: 'A', details: 'B', valid_until: '2026-08-31' });
    expect(r.ok).toBe(true);
  });
  it('rejects a name longer than 120 characters', () => {
    expect(validateOfferInput({ name: 'x'.repeat(121), details: 'y' }).ok).toBe(false);
  });
  it('accepts a name exactly 120 characters', () => {
    const r = validateOfferInput({ name: 'x'.repeat(120), details: 'y', valid_until: '2026-08-31' });
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

// Every case here is one that has actually happened on this platform, which is
// why the check exists at all.
describe('offerReadinessForCampaign', () => {
  const TODAY = '2026-10-28';

  it('warns when no offer is set — the Fitness First Diwali case', () => {
    const r = offerReadinessForCampaign({}, TODAY);
    expect(r.level).toBe('warn');
    expect(r.headline).toMatch(/no offer is set/i);
    expect(r.detail).toMatch(/knowledge base/i);
  });

  it('warns when the offer has already ended — the VMS case', () => {
    const r = offerReadinessForCampaign(
      { active_offer: { name: 'VMS & Alibaba', details: 'x', valid_from: '2026-09-07', valid_until: '2026-09-09' } },
      TODAY,
    );
    expect(r.level).toBe('warn');
    expect(r.headline).toContain('VMS & Alibaba');
    expect(r.detail).toContain('2026-09-09');
  });

  it('warns when the offer starts later than the campaign', () => {
    const r = offerReadinessForCampaign(
      { active_offer: { name: 'Diwali', details: 'x', valid_from: '2026-11-05' } },
      TODAY,
    );
    expect(r.level).toBe('warn');
    expect(r.headline).toMatch(/not started/i);
    expect(r.detail).toContain('2026-11-05');
  });

  // Thames ran this one into late October with no end date, and it stayed the
  // only price its bot would quote.
  it('warns when a running offer has no end date', () => {
    const r = offerReadinessForCampaign(
      { active_offer: { name: 'Monsoon Offer', details: 'x' } },
      TODAY,
    );
    expect(r.level).toBe('warn');
    expect(r.headline).toMatch(/no end date/i);
  });

  it('is happy with a running offer that retires itself', () => {
    const r = offerReadinessForCampaign(
      { active_offer: { name: 'Diwali Special', details: 'x', valid_from: '2026-10-28', valid_until: '2026-11-09' } },
      TODAY,
    );
    expect(r.level).toBe('ok');
    expect(r.headline).toContain('Diwali Special');
    expect(r.detail).toContain('2026-11-09');
  });

  it('treats a malformed offer as no offer rather than throwing', () => {
    expect(offerReadinessForCampaign({ active_offer: { name: '', details: '' } }, TODAY).level).toBe('warn');
    expect(offerReadinessForCampaign(null, TODAY).level).toBe('warn');
  });
});

describe('daysBetweenISO / formatOfferDate', () => {
  it('counts whole days in both directions', () => {
    expect(daysBetweenISO('2026-10-30', '2026-11-09')).toBe(10);
    expect(daysBetweenISO('2026-10-30', '2026-10-30')).toBe(0);
    expect(daysBetweenISO('2026-10-30', '2026-10-28')).toBe(-2);
  });
  // A month boundary and a DST-free zone are not the same thing; the arithmetic
  // is done in UTC so neither matters.
  it('crosses months and years', () => {
    expect(daysBetweenISO('2026-12-28', '2027-01-04')).toBe(7);
  });
  it('writes a date the way a person reads it, with the year only when it differs', () => {
    expect(formatOfferDate('2026-11-09', '2026-10-30')).toBe('9 Nov');
    expect(formatOfferDate('2025-08-31', '2026-10-30')).toBe('31 Aug 2025');
    expect(formatOfferDate('nonsense', '2026-10-30')).toBe('nonsense');
  });
});

describe('offerAlert', () => {
  const alertFor = (o: object | null, today: string) =>
    offerAlertForSettings(o ? { active_offer: o } : null, today);

  // Deliberately not a warning: ten of twelve workspaces run this way.
  it('is quiet when no offer is set, and says what the bot does instead', () => {
    const a = alertFor(null, '2026-10-30');
    expect(a.tone).toBe('neutral');
    expect(a.status).toBe('none');
    expect(a.action).toBe('set');
    expect(a.detail).toMatch(/knowledge base/);
  });

  // Fitness First's live offer, on the day this was written.
  it('reassures while an offer is comfortably running', () => {
    const a = alertFor(
      { name: 'Diwali Special — FLAT 30% OFF', details: '₹3,333/month', valid_from: '2026-10-28', valid_until: '2026-11-09' },
      '2026-10-30',
    );
    expect(a.tone).toBe('good');
    expect(a.daysLeft).toBe(10);
    expect(a.headline).toBe('The bot is quoting "Diwali Special — FLAT 30% OFF"');
    expect(a.detail).toMatch(/Valid until 9 Nov — 10 days left/);
  });

  it('calls out the last week, the last day and the day before', () => {
    const o = { name: 'Diwali', details: 'x', valid_until: '2026-11-09' };
    expect(alertFor(o, '2026-11-02')).toMatchObject({ tone: 'warn', daysLeft: 7, headline: '"Diwali" ends in 7 days' });
    expect(alertFor(o, '2026-11-08')).toMatchObject({ tone: 'warn', headline: '"Diwali" ends tomorrow' });
    expect(alertFor(o, '2026-11-09')).toMatchObject({ tone: 'warn', daysLeft: 0, headline: '"Diwali" ends today' });
  });

  // The boundary that decides whether a banner appears at all.
  it('stays quiet one day before the window opens', () => {
    expect(alertFor({ name: 'Diwali', details: 'x', valid_until: '2026-11-09' }, '2026-11-01').tone).toBe('good');
  });

  it('is loud once it has ended, and says the bot stopped quoting it', () => {
    const o = { name: 'Monsoon Offer', details: 'x', valid_until: '2026-08-31' };
    expect(alertFor(o, '2026-09-01')).toMatchObject({ tone: 'bad', headline: '"Monsoon Offer" ended yesterday' });
    const late = alertFor(o, '2026-10-30');
    expect(late.headline).toBe('"Monsoon Offer" ended 60 days ago');
    expect(late.daysLeft).toBe(-60);
    expect(late.action).toBe('extend_or_replace');
    expect(late.detail).toMatch(/stopped quoting/);
  });

  it('warns about an offer with no end date, which never retires', () => {
    const a = alertFor({ name: 'Monsoon Offer', details: 'x' }, '2026-10-30');
    expect(a).toMatchObject({ tone: 'warn', status: 'active', daysLeft: null, action: 'add_end_date' });
    expect(a.headline).toBe('"Monsoon Offer" has no end date');
  });

  it('says when a scheduled offer begins rather than treating it as live', () => {
    const a = alertFor({ name: 'Republic Day', details: 'x', valid_from: '2027-01-20', valid_until: '2027-01-31' }, '2026-12-28');
    expect(a).toMatchObject({ tone: 'info', status: 'scheduled' });
    expect(a.headline).toBe('"Republic Day" starts 20 Jan 2027');
  });

  // The two places that answer "what will the bot quote?" must not disagree.
  it('agrees with the campaign wizard on every state', () => {
    const cases: Array<[object | null, string]> = [
      [null, '2026-10-30'],
      [{ name: 'A', details: 'x', valid_until: '2026-08-31' }, '2026-10-30'],
      [{ name: 'A', details: 'x', valid_from: '2026-12-01', valid_until: '2026-12-31' }, '2026-10-30'],
      [{ name: 'A', details: 'x' }, '2026-10-30'],
      [{ name: 'A', details: 'x', valid_until: '2026-11-30' }, '2026-10-30'],
    ];
    for (const [o, today] of cases) {
      const settings = o ? { active_offer: o } : null;
      const wizard = offerReadinessForCampaign(settings, today);
      const dash = offerAlertForSettings(settings, today);
      // The wizard warns about everything that is not a healthy running offer;
      // the dashboard is only reassuring in that one case.
      expect(dash.tone === 'good', JSON.stringify(o)).toBe(wizard.level === 'ok');
    }
  });
});

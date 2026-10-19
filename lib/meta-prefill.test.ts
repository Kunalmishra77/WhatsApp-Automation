import { describe, it, expect } from 'vitest';
import {
  normalisePrefill, isLearnablePrefill, isTrustedPrefill, matchPrefill,
} from './meta-prefill';

// Every string below is a real opening message from production (Razorveda,
// Umang Hospital, Fitness First), which is what makes these tests worth having:
// the old exact-match attribution missed the variants, and the first version of
// the learning rule happily learned the typed-by-hand ones.
const MAMO_FIRM = 'Hi, I’m interested in Mamo Firm. Could you please tell me more about this produc';
const MAMO_PLUS = 'Hi, I need more info about Mamo Plus';

describe('normalisePrefill', () => {
  it('folds the variants of one ad into the same form', () => {
    const base = normalisePrefill(MAMO_PLUS);
    expect(normalisePrefill('🍬🩷Hi, I need more info about Mamo Plus')).toBe(base);
    expect(normalisePrefill('  HI, I NEED MORE INFO ABOUT MAMO PLUS  ')).toBe(base);
    expect(normalisePrefill('👍🏾Hi, I need more info about Mamo Plus')).toBe(base);
  });

  it('straightens curly apostrophes', () => {
    expect(normalisePrefill('Hi, I’m interested')).toBe(normalisePrefill("Hi, I'm interested"));
  });

  it('collapses runs of whitespace', () => {
    expect(normalisePrefill('Hi,   I  need\n\ninfo')).toBe('hi, i need info');
  });
});

describe('isLearnablePrefill', () => {
  it('learns a real ad pre-fill', () => {
    expect(isLearnablePrefill(MAMO_FIRM)).toBe(true);
    expect(isLearnablePrefill(MAMO_PLUS)).toBe(true);
    expect(isLearnablePrefill('Hi! I’m interested in Fitness First Dwarka membership. Please share the details.')).toBe(true);
  });

  // These were all learned by the first, looser rule. They are questions people
  // type themselves, and a hospital's organic visitors ask them constantly —
  // trusting one would tag every organic chat as an ad lead.
  it.each([
    'Kaha par hai', 'Location send me', 'address kya hai ji', 'Abha card ha',
    'I want service', 'Hi, I need help', 'Chaj kitna h', 'today',
  ])('refuses to learn a typed-by-hand opening: %s', (text) => {
    expect(isLearnablePrefill(text)).toBe(false);
  });

  it.each(['hi', 'Hii', 'hello', 'Price', 'हाय', '.', ''])('refuses a bare greeting: %s', (text) => {
    expect(isLearnablePrefill(text)).toBe(false);
  });

  it('refuses our own placeholders and bare links', () => {
    expect(isLearnablePrefill('[Tapped button: "Talk to Expert"]')).toBe(false);
    expect(isLearnablePrefill('⚠️ Customer sent a message WhatsApp couldn\'t read (e.g. a forwarded code/OTP).')).toBe(false);
    expect(isLearnablePrefill('https://iodb.mhpor.xyz/j2wvjncBR2/2d499ff575d5639efd4880d75a?p=w')).toBe(false);
  });

  it('refuses null and undefined', () => {
    expect(isLearnablePrefill(null)).toBe(false);
    expect(isLearnablePrefill(undefined)).toBe(false);
  });
});

describe('isTrustedPrefill', () => {
  it('trusts a hand-registered text immediately, however short', () => {
    expect(isTrustedPrefill({ text: 'today', template_name: null, auto_learned: false })).toBe(true);
  });

  it('needs a second sighting before trusting a learned text', () => {
    const row = { text: MAMO_PLUS, template_name: 'Mamo Plus', auto_learned: true };
    expect(isTrustedPrefill({ ...row, seen_count: 1 })).toBe(false);
    expect(isTrustedPrefill({ ...row, seen_count: 2 })).toBe(true);
  });

  // Rows learned under the earlier, looser rule are already in the database. The
  // length check lives here as well as at learn time so they can never start
  // attributing traffic, however many times they are seen again.
  it('never trusts a short learned text, however often it is seen', () => {
    expect(isTrustedPrefill({
      text: 'Kaha par hai', template_name: null, auto_learned: true, seen_count: 99,
    })).toBe(false);
  });
});

describe('matchPrefill', () => {
  const known = [{ text: MAMO_PLUS, template_name: 'Mamo Plus' }];

  it('matches the exact text', () => {
    expect(matchPrefill(MAMO_PLUS, known)?.template_name).toBe('Mamo Plus');
  });

  it('matches through an emoji prefix and different casing', () => {
    expect(matchPrefill('🍬🩷Hi, I need more info about Mamo Plus', known)?.template_name).toBe('Mamo Plus');
    expect(matchPrefill('hi, i need more info about mamo plus', known)?.template_name).toBe('Mamo Plus');
  });

  it('matches a longer message that starts with the known pre-fill', () => {
    // Meta truncates long pre-fills in the composer, so the same ad arrives whole
    // or cut short.
    expect(matchPrefill(`${MAMO_PLUS} please`, known)?.template_name).toBe('Mamo Plus');
    expect(matchPrefill(MAMO_FIRM, [{ text: `${MAMO_FIRM}t?`, template_name: 'Mamo Firm' }])
      ?.template_name).toBe('Mamo Firm');
  });

  it('does not match an unrelated message', () => {
    expect(matchPrefill('Do you deliver to Jaipur and what is the cost', known)).toBeNull();
    expect(matchPrefill('Price', known)).toBeNull();
  });

  it('will not match a short message at all', () => {
    // Guards the hand-registered junk: Umang Hospital has "today" registered, and
    // a chat opening with "today" must not become an ad lead.
    expect(matchPrefill('today', [{ text: 'today', template_name: 'x' }])).toBeNull();
  });

  it('handles empty input and an empty pre-fill list', () => {
    expect(matchPrefill(null, known)).toBeNull();
    expect(matchPrefill(MAMO_PLUS, [])).toBeNull();
  });
});

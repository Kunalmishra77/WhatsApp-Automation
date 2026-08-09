import { describe, expect, it } from 'vitest';
import { decideSpam } from '../lib/spam';

describe('decideSpam', () => {
  it('true only for a first-and-only inbound categorized spam with no lead', () => {
    expect(decideSpam({ label: 'spam', inboundCount: 1, hasLead: false })).toBe(true);
  });
  it('false on a 2nd inbound (customer engaged)', () => {
    expect(decideSpam({ label: 'spam', inboundCount: 2, hasLead: false })).toBe(false);
  });
  it('false when the contact has a lead', () => {
    expect(decideSpam({ label: 'spam', inboundCount: 1, hasLead: true })).toBe(false);
  });
  it('false for any non-spam label', () => {
    for (const label of ['sales', 'general', 'inquiry', 'support', 'billing', 'complaint', null]) {
      expect(decideSpam({ label, inboundCount: 1, hasLead: false })).toBe(false);
    }
  });
});

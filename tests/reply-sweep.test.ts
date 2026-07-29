import { describe, expect, it } from 'vitest';
import { isDeclineMessage } from '../lib/reply-sweep';

describe('isDeclineMessage', () => {
  it('flags decline / stop signals (any case, incl. button taps)', () => {
    for (const s of ['Not interested', '[Tapped button: "Not Interested"]', 'STOP', 'please unsubscribe', 'band karo', 'mat bhejo']) {
      expect(isDeclineMessage(s)).toBe(true);
    }
  });
  it('does not flag normal buying / greeting messages', () => {
    for (const s of ['[Tapped button: "Shop Now"]', 'Hi', 'I want breast care', 'price kya hai']) {
      expect(isDeclineMessage(s)).toBe(false);
    }
  });
  it('handles null / empty', () => {
    expect(isDeclineMessage(null)).toBe(false);
    expect(isDeclineMessage('')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { decideModerationAction, type ModerationResult } from './moderation';

const result = (over: Partial<ModerationResult> = {}): ModerationResult => ({
  flagged: false, categories: [], sexual: false, illegal: false, ...over,
});

const EXPLICIT = result({ flagged: true, sexual: true, categories: ['sexual'] });
const MINORS   = result({ flagged: true, sexual: true, illegal: true, categories: ['sexual/minors'] });
const CLEAN    = result();
const VIOLENT  = result({ flagged: true, categories: ['violence'] });

describe('decideModerationAction', () => {
  // The policy the client chose: the first offence only silences the bot and
  // flags the chat, so one wrong call never costs them a real customer —
  // Razorveda sells skincare, and someone photographing their own skin is a
  // genuine enquiry. The second offence is no longer plausibly a mistake.
  it('warns on a first explicit image and blocks on the second', () => {
    expect(decideModerationAction(EXPLICIT, 0)).toBe('warn');
    expect(decideModerationAction(EXPLICIT, 1)).toBe('block');
    expect(decideModerationAction(EXPLICIT, 7)).toBe('block');
  });

  it('blocks sexual content involving minors immediately', () => {
    // No benign reading of it, so the one-strike grace does not apply.
    expect(decideModerationAction(MINORS, 0)).toBe('block');
  });

  it('does nothing for clean content', () => {
    expect(decideModerationAction(CLEAN, 0)).toBe('none');
    expect(decideModerationAction(CLEAN, 5)).toBe('none');
  });

  // Strikes exist for explicit images. An angry customer is a support problem,
  // not something to cut off automatically.
  it('does not act on non-sexual flags such as violence', () => {
    expect(decideModerationAction(VIOLENT, 0)).toBe('none');
    expect(decideModerationAction(VIOLENT, 3)).toBe('none');
  });
});

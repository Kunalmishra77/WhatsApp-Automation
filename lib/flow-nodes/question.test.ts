import { describe, it, expect } from 'vitest';
import { resolveChoices, answerMode, matchChoice, choiceHandle, questionHandler } from './question';

// Question data always carries a label in the editor; these tests care about
// the choice fields, so the label comes from here.
const q = (extra: object) => ({ label: 'Q', message: 'q', timeoutHours: 24, ...extra });

const CHOICES = [
  { id: 'yes', title: 'Yes, interested' },
  { id: 'no', title: 'Not now' },
  { id: 'call', title: 'Call me' },
];

describe('resolveChoices', () => {
  it('returns authored choices as they are', () => {
    expect(resolveChoices(q({ choices: CHOICES }))).toEqual(CHOICES);
  });

  // The engine accepted `buttons: string[]` long before the editor could set it.
  // Those flows must keep working, and they gain per-button branches for free.
  it('turns legacy button titles into choices', () => {
    expect(resolveChoices(q({ buttons: ['Book Now', 'Later'] })))
      .toEqual([{ id: 'Book Now', title: 'Book Now' }, { id: 'Later', title: 'Later' }]);
  });

  it('is empty for a plain typed question', () => {
    expect(resolveChoices(q({ message: 'Your name?' }))).toEqual([]);
  });
});

describe('answerMode', () => {
  it('is text when nothing is offered', () => {
    expect(answerMode(q({}))).toBe('text');
  });

  it('defaults to buttons when choices exist but no mode was set', () => {
    expect(answerMode(q({ choices: CHOICES }))).toBe('buttons');
  });

  it('honours an explicit mode', () => {
    expect(answerMode(q({ choices: CHOICES, answerMode: 'list' })))
      .toBe('list');
  });
});

describe('matchChoice', () => {
  it('matches the id a tap carries', () => {
    expect(matchChoice(CHOICES, '[Tapped button: "Not now"]', { id: 'no' })?.id).toBe('no');
  });

  // This is why the structured reply travels separately: the stored message text
  // is a display label, so matching on it alone would fail every tap.
  it('matches the title a tap carries when the id is unknown', () => {
    expect(matchChoice(CHOICES, '[Tapped button: "Call me"]', { title: 'Call me' })?.id).toBe('call');
  });

  it('matches a typed title regardless of case and padding', () => {
    expect(matchChoice(CHOICES, '  not NOW  ')?.id).toBe('no');
  });

  it('matches a number as a position, for people who reply by counting', () => {
    expect(matchChoice(CHOICES, '3')?.id).toBe('call');
  });

  it('is null for a position outside the list', () => {
    expect(matchChoice(CHOICES, '9')).toBeNull();
  });

  it('is null when the reply is not one of the choices', () => {
    expect(matchChoice(CHOICES, 'what is the price?')).toBeNull();
  });

  it('is null for an empty reply', () => {
    expect(matchChoice(CHOICES, '')).toBeNull();
  });
});

describe('questionHandler.handles', () => {
  it('names a branch per choice, plus other and timeout', () => {
    expect(questionHandler.handles!(q({ choices: CHOICES })))
      .toEqual(['choice_yes', 'choice_no', 'choice_call', 'other', 'timeout']);
  });

  it('names only other and timeout for a typed question', () => {
    expect(questionHandler.handles!(q({})))
      .toEqual(['other', 'timeout']);
  });
});

describe('questionHandler.resume', () => {
  const ctx = (data: object, incoming: string, choice?: { id?: string; title?: string }) => ({
    node: { id: 'q1', type: 'question', data, position: { x: 0, y: 0 } },
    flow: { nodes: [], edges: [] },
    incoming,
    choice,
    vars: {},
    send: {} as never,
    ops: {} as never,
    workspaceId: 'w', conversationId: 'c', sessionId: 's',
    contactId: null, contactPhone: '91',
    interpolate: (s: string) => s,
  }) as never;

  it('follows the single edge for a typed question', async () => {
    const r = await questionHandler.resume!(ctx(q({ message: 'Name?' }), 'Amit'));
    expect(r.outcome).toEqual({ next: 'edge' });
  });

  it('follows the tapped choice branch', async () => {
    const r = await questionHandler.resume!(
      ctx(q({ choices: CHOICES }), '[Tapped button: "Call me"]', { id: 'call' }),
    );
    expect(r.outcome).toEqual({ next: 'edge', handle: choiceHandle('call') });
  });

  // Someone who ignores the buttons and asks a question must not be routed down
  // whichever branch happened to be wired first.
  it('sends an unmatched reply down the other branch', async () => {
    const r = await questionHandler.resume!(
      ctx(q({ choices: CHOICES }), 'kitna price hai?'),
    );
    expect(r.outcome).toEqual({ next: 'edge', handle: 'other' });
  });
});

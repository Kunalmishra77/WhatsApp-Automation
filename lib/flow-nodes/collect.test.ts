import { describe, it, expect, vi } from 'vitest';
import { isAcceptable, collectHandler, attemptsKey } from './collect';

describe('isAcceptable — what people actually type on a phone', () => {
  it('takes an Indian mobile number in the shapes people send it', () => {
    for (const ok of ['9876543210', '+91 9876543210', '91-9876543210', '98765 43210']) {
      expect(isAcceptable('phone', ok), ok).toBe(true);
    }
  });

  it('refuses what a phone number is not', () => {
    for (const bad of ['asdf', 'yes', '12345', '1234567890123456', 'call me']) {
      expect(isAcceptable('phone', bad), bad).toBe(false);
    }
  });

  it('takes an email and refuses a near-miss', () => {
    expect(isAcceptable('email', 'amit@example.co.in')).toBe(true);
    expect(isAcceptable('email', 'amit@example')).toBe(false);
    expect(isAcceptable('email', 'amit at example dot com')).toBe(false);
  });

  // Dates come in every shape, and in two languages.
  it('takes a date however it is written', () => {
    for (const ok of ['5/11', '05-11-2026', '5 Nov', 'November 5', 'tomorrow', 'kal', 'Monday']) {
      expect(isAcceptable('date', ok), ok).toBe(true);
    }
  });

  it('takes a time however it is written', () => {
    for (const ok of ['10am', '10:30', '4.30 pm', '11 baje', 'morning', 'shaam']) {
      expect(isAcceptable('time', ok), ok).toBe(true);
    }
  });

  // The whole reason this step exists: "yes" is not a name, and a flow that
  // saved it would hand the client a lead called Yes.
  it('refuses the words people send instead of a name', () => {
    for (const bad of ['yes', 'ok', 'hi', 'haan', 'nahi', 'k', '12345']) {
      expect(isAcceptable('name', bad), bad).toBe(false);
    }
    expect(isAcceptable('name', 'Amit')).toBe(true);
    expect(isAcceptable('name', 'सोनिया')).toBe(true);
  });

  it('accepts anything when nothing in particular was asked for', () => {
    expect(isAcceptable('any', 'whatever')).toBe(true);
    expect(isAcceptable('any', '   ')).toBe(false);
  });
});

function ctxFor(data: object, incoming: string, vars: Record<string, string | number> = {}) {
  const sent: string[] = [];
  const ctx = {
    node: { id: 'c1', type: 'collect', data, position: { x: 0, y: 0 } },
    flow: { nodes: [], edges: [] },
    incoming,
    vars,
    send: {
      text: async (body: string) => { sent.push(body); },
      buttons: vi.fn(), media: vi.fn(), location: vi.fn(), list: vi.fn(), template: vi.fn(),
    },
    ops: {} as never,
    ai: { reply: async () => null },
    workspaceId: 'w', conversationId: 'c', sessionId: 's',
    contactId: null, contactPhone: '91',
    interpolate: (t: string) => t,
  };
  return { ctx, sent };
}

describe('collectHandler', () => {
  const PHONE_STEP = { message: 'What is your mobile number?', expects: 'phone', saveAsVariable: 'phone' };

  it('asks and waits', async () => {
    const { ctx, sent } = ctxFor(PHONE_STEP, '');
    const r = await collectHandler.run(ctx as never);
    expect(sent).toEqual(['What is your mobile number?']);
    expect(r.outcome).toEqual({ next: 'wait' });
  });

  it('keeps a good answer and moves on', async () => {
    const { ctx } = ctxFor(PHONE_STEP, '9876543210');
    const r = await collectHandler.resume!(ctx as never);
    expect(r.outcome).toEqual({ next: 'edge' });
    expect(r.setVars).toMatchObject({ phone_text: '9876543210' });
  });

  // A plain Question would have saved this and nobody would have known.
  it('does not save a bad answer', async () => {
    const { ctx, sent } = ctxFor(PHONE_STEP, 'asdf');
    const r = await collectHandler.resume!(ctx as never);
    expect(r.outcome).toEqual({ next: 'wait' });
    expect(r.setVars).not.toHaveProperty('phone_text');
    expect(sent[0]).toMatch(/10-digit/);
    // It re-asks the original question too, so the customer knows what is wanted.
    expect(sent[1]).toBe('What is your mobile number?');
  });

  it('uses the author’s own retry wording when there is one', async () => {
    const { ctx, sent } = ctxFor({ ...PHONE_STEP, retryMessage: 'Arre, 10 digit ka number bhejiye please 🙏' }, 'asdf');
    await collectHandler.resume!(ctx as never);
    expect(sent[0]).toContain('10 digit ka number');
  });

  it('counts the tries in the session, not in memory', async () => {
    const { ctx } = ctxFor(PHONE_STEP, 'asdf');
    const r = await collectHandler.resume!(ctx as never);
    expect(r.setVars).toMatchObject({ [attemptsKey('c1')]: 1 });
  });

  // Asking a fourth time is worse than handing over.
  it('gives up down its own branch once the tries run out', async () => {
    const { ctx, sent } = ctxFor(
      { ...PHONE_STEP, maxAttempts: 2 },
      'still not a number',
      { [attemptsKey('c1')]: 2 },
    );
    const r = await collectHandler.resume!(ctx as never);
    expect(r.outcome).toEqual({ next: 'edge', handle: 'gave_up' });
    expect(sent).toEqual([]);
  });

  it('resets the count after a good answer, so a later mistake starts fresh', async () => {
    const { ctx } = ctxFor(PHONE_STEP, '9876543210', { [attemptsKey('c1')]: 1 });
    const r = await collectHandler.resume!(ctx as never);
    expect(r.setVars).toMatchObject({ [attemptsKey('c1')]: 0 });
  });

  it('offers a branch for giving up and one for silence', () => {
    expect(collectHandler.handles!({})).toEqual(['gave_up', 'timeout']);
  });
});

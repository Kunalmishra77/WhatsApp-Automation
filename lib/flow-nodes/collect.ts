// lib/flow-nodes/collect.ts
//
// A question that checks the answer before accepting it.
//
// A plain Question takes whatever arrives. A flow asking for a phone number
// saves "asdf", a flow asking for a date saves "yes", and nobody finds out
// until someone reads the lead. The engine has a `forceAsk` flag that re-ask
// loops were built out of by hand on the canvas — a question, a condition, and
// an edge drawn back up — which is three steps to express one idea and easy to
// wire wrongly.
//
// This asks, checks, and either moves on or asks again in the author's own
// words. After a set number of tries it gives up down its own branch, so a
// customer who cannot answer is handed to a person instead of being asked
// forever.

import type { NodeHandler } from './types';
import { placeholdersIn } from './pure';

export type CollectKind = 'any' | 'name' | 'phone' | 'email' | 'number' | 'date' | 'time';

export interface CollectNodeData {
  label?: string;
  message?: string;
  /** What the answer has to look like. */
  expects?: CollectKind;
  saveAsVariable?: string;
  /** Sent when the answer does not fit, before asking again. */
  retryMessage?: string;
  /** How many times to re-ask before taking the `gave_up` branch. Default 2. */
  maxAttempts?: number;
  timeoutHours?: number;
}

/** Tracks re-asks for this node inside the session context. */
export const attemptsKey = (nodeId: string) => `__collect_attempts_${nodeId}`;

// Indian mobile numbers, with or without country code, spaces or dashes.
const PHONE = /^(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// A date a person would type: 5/11, 05-11-2026, 5 Nov, November 5, or a weekday.
const DATE = /(\b\d{1,2}\s*[/-]\s*\d{1,2}(\s*[/-]\s*\d{2,4})?\b)|(\b\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)|(\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{1,2}\b)|(\b(today|tomorrow|kal|aaj|parso)\b)|(\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b)/i;
// 10am, 10:30, 10 baje, morning/evening.
const TIME = /(\b\d{1,2}\s*[:.]\s*\d{2}\b)|(\b\d{1,2}\s*(am|pm|baje)\b)|(\b(morning|afternoon|evening|subah|shaam|dopahar)\b)/i;

/**
 * Whether a reply is usable as this kind of answer.
 *
 * Deliberately forgiving: these run against what a person types on a phone, and
 * rejecting a real answer is worse than accepting a slightly odd one. The point
 * is to catch "asdf" and "yes" where a phone number belongs, not to enforce a
 * format.
 */
export function isAcceptable(kind: CollectKind, reply: string): boolean {
  const value = reply.trim();
  if (!value) return false;

  switch (kind) {
    case 'phone':  return PHONE.test(value.replace(/[()]/g, ''));
    case 'email':  return EMAIL.test(value);
    case 'number': return /\d/.test(value);
    case 'date':   return DATE.test(value);
    case 'time':   return TIME.test(value);
    case 'name':
      // Counted, not matched consecutively: in Devanagari the vowel signs
      // between letters are combining marks, so "सोनिया" has no two letters in
      // a row and a /\p{L}{2,}/ test rejects a perfectly ordinary name.
      return (value.match(/\p{L}/gu) ?? []).length >= 2
        && !/^(yes|no|ok|okay|hi|hello|hmm|haan|nahi|ji|k)$/i.test(value);
    case 'any':
    default:
      return true;
  }
}

const DEFAULT_RETRY: Record<CollectKind, string> = {
  any:    'Sorry, I did not catch that — could you send it again?',
  name:   'Sorry, I did not catch the name — could you type it again?',
  phone:  'That does not look like a mobile number. Could you send a 10-digit number?',
  email:  'That does not look like an email address. Could you check and send it again?',
  number: 'Could you send that as a number?',
  date:   'Could you send a date — like 5 Nov, or tomorrow?',
  time:   'Could you send a time — like 10am, or 4:30?',
};

export const collectHandler: NodeHandler = {
  type: 'collect',

  handles: () => ['gave_up', 'timeout'],

  async run(ctx) {
    const d = ctx.node.data as CollectNodeData;
    if (d.message) await ctx.send.text(ctx.interpolate(d.message));
    return { outcome: { next: 'wait' } };
  },

  async resume(ctx) {
    const d = ctx.node.data as CollectNodeData;
    const kind = d.expects ?? 'any';
    const reply = (ctx.choice?.title ?? ctx.incoming ?? '').trim();

    if (isAcceptable(kind, reply)) {
      // This node saves its own answer, unlike a plain Question whose answer
      // the engine stores on the way in. That is the point: a value is only
      // worth keeping once it has passed the check.
      const patch: Record<string, number | string> = { [attemptsKey(ctx.node.id)]: 0 };
      if (d.saveAsVariable) {
        const digits = reply.match(/\d+/);
        patch[d.saveAsVariable] = digits ? parseInt(digits[0], 10) : 0;
        patch[`${d.saveAsVariable}_text`] = reply;
      }
      return { outcome: { next: 'edge' }, setVars: patch };
    }

    // The count lives in the session, so a customer who wanders off and comes
    // back a day later is not silently on their last try.
    const used = Number(ctx.vars[attemptsKey(ctx.node.id)] ?? 0) + 1;
    const limit = typeof d.maxAttempts === 'number' && d.maxAttempts > 0 ? d.maxAttempts : 2;

    if (used > limit) {
      // Out of tries. The branch exists so this ends with a person rather than
      // with the same question a fourth time.
      return { outcome: { next: 'edge', handle: 'gave_up' }, setVars: { [attemptsKey(ctx.node.id)]: 0 } };
    }

    await ctx.send.text(ctx.interpolate(d.retryMessage?.trim() || DEFAULT_RETRY[kind]));
    if (d.message) await ctx.send.text(ctx.interpolate(d.message));

    return { outcome: { next: 'wait' }, setVars: { [attemptsKey(ctx.node.id)]: used } };
  },

  describe(data) {
    const d = data as CollectNodeData;
    return {
      readsVars: [...placeholdersIn(d.message), ...placeholdersIn(d.retryMessage)],
      writesVars: d.saveAsVariable ? [d.saveAsVariable] : [],
    };
  },
};

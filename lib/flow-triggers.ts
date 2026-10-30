// lib/flow-triggers.ts
//
// Which flow a message starts, and whether it is the right time of day for it.
//
// This logic used to sit inline in flow-engine.ts, in a block with two cases
// and no way to test it — and the engine's module cannot be imported from a
// test without its database. Pulled out whole, so the awkward parts (an
// overnight window, a fallback that must not swallow every other trigger) have
// tests rather than only intentions.
//
// India has no daylight saving, so a fixed +05:30 is exact for "after 6pm" and
// keeps this free of a timezone library.

const IST_OFFSET_MIN = 330;

export type FlowTriggerType =
  /** The contact's first message in 24 hours. */
  | 'first_message'
  /** The message contains this word or phrase. */
  | 'keyword'
  /** They tapped a button or picked a list row with this id, or this title. */
  | 'button'
  /** They came from a Meta ad. `trigger_value` narrows it to one ad id. */
  | 'ad_click'
  /** The message is a reply to a campaign. `trigger_value` narrows it to one. */
  | 'campaign_reply'
  /** Started by a person or by the API, never by a message. */
  | 'manual'
  /** Any message at all. Always tried last, whatever its priority. */
  | 'any_message';

/**
 * When a flow is allowed to start. Absent means always.
 *
 * `from` after `to` is an overnight window — 22:00 to 06:00 — which is the
 * whole point of having this: an after-hours flow and a working-hours flow
 * sharing one trigger.
 */
export interface ActiveWindow {
  /** 0 = Sunday … 6 = Saturday. Absent or empty means every day. */
  days?: number[];
  /** "HH:MM" in IST. Both are needed for a time window to apply. */
  from?: string;
  to?: string;
}

export interface TriggerCandidate {
  id: string;
  name: string;
  triggerType: string | null;
  triggerValue: string | null;
  priority?: number | null;
  createdAt: string | null;
  activeWindow?: ActiveWindow | null;
}

export interface TriggerSignal {
  message: string;
  /** The contact's first message in 24 hours, worked out by the caller. */
  isFirstContactMessage: boolean;
  /** Set when the customer tapped rather than typed. */
  choice?: { id?: string; title?: string };
  /** The ad this conversation came from, if any. */
  adId?: string | null;
  /** The campaign this message is a reply to, if any. */
  campaignId?: string | null;
  /** Defaults to now. Passed in by tests, and by anything replaying. */
  now?: Date;
}

/** Trigger types a flow can carry. Anything else is a flow this build cannot start. */
export const TRIGGER_TYPES: ReadonlyArray<FlowTriggerType> = [
  'first_message', 'keyword', 'button', 'ad_click',
  'campaign_reply', 'manual', 'any_message',
];

function norm(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

function minutesOfDayIST(now: Date): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function weekdayIST(now: Date): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return ist.getUTCDay();
}

/** "HH:MM" to minutes, or null when it is not a time. */
function parseHHMM(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Whether `now` falls inside the window.
 *
 * `from` is inclusive and `to` exclusive, so two windows meeting at 18:00
 * ("09:00–18:00" and "18:00–09:00") cover the day exactly once between them
 * rather than both claiming 18:00.
 *
 * An overnight window belongs to the day it STARTS on: "Friday 22:00 to 06:00"
 * runs into Saturday morning and is a Friday window. Anything else would make
 * "we are closed on Sunday" mean the Saturday night flow stops at midnight.
 */
export function isWithinWindow(window: ActiveWindow | null | undefined, now: Date): boolean {
  if (!window) return true;

  const days = Array.isArray(window.days) && window.days.length > 0 ? window.days : null;
  const from = parseHHMM(window.from);
  const to = parseHHMM(window.to);

  // A half-written window is treated as no time restriction rather than as
  // "never": an author who set the days and not the hours meant those days.
  if (from === null || to === null) {
    return days === null ? true : days.includes(weekdayIST(now));
  }

  const minutes = minutesOfDayIST(now);
  const today = weekdayIST(now);

  if (from < to) {
    if (minutes < from || minutes >= to) return false;
    return days === null || days.includes(today);
  }

  // Overnight. Either we are past `from` tonight, or before `to` on the morning
  // after a window that started yesterday.
  if (minutes >= from) {
    return days === null || days.includes(today);
  }
  if (minutes < to) {
    const yesterday = (today + 6) % 7;
    return days === null || days.includes(yesterday);
  }
  return false;
}

/**
 * Does this flow's trigger fire for this signal, ignoring the time window?
 *
 * Exported so the editor's conflict check and the engine agree on what a
 * trigger means, rather than each having its own reading.
 */
export function triggerFires(flow: TriggerCandidate, signal: TriggerSignal): boolean {
  const value = norm(flow.triggerValue);

  switch (flow.triggerType) {
    case 'first_message':
      return signal.isFirstContactMessage;

    case 'keyword':
      // `includes`, not equality, which is how it has always behaved — and the
      // reason the editor warns when one keyword hides inside another.
      return value.length > 0 && norm(signal.message).includes(value);

    case 'button': {
      // A tap arrives with an id and a title; the message text is a display
      // label like `[Tapped button: "Book Now"]`, useless to match on. The id
      // is matched first because it is stable when the wording changes, and the
      // title second because the author of a template may only know that.
      if (!signal.choice) return false;
      if (value.length === 0) return true;
      return norm(signal.choice.id) === value || norm(signal.choice.title) === value;
    }

    case 'ad_click':
      if (!signal.adId) return false;
      // An empty value means any ad, which is what a client wants nine times
      // out of ten — one flow for everyone who clicked anything.
      return value.length === 0 || norm(signal.adId) === value;

    case 'campaign_reply':
      if (!signal.campaignId) return false;
      return value.length === 0 || norm(signal.campaignId) === value;

    case 'any_message':
      return true;

    // Started by a person or the API. A message must never start it, or a
    // manual flow would fire for everyone the moment it was switched on.
    case 'manual':
      return false;

    default:
      // A flow saved by a newer deploy, naming a trigger this build does not
      // know. Not starting it is the only safe reading.
      return false;
  }
}

/**
 * The order the engine resolves triggers in: highest priority first, oldest
 * breaking the tie.
 *
 * `any_message` is forced to the back regardless of its priority. It is a
 * fallback, and a fallback that can win on age or on a number someone typed
 * would swallow every specific trigger in the workspace — which is the one
 * mistake this trigger type makes easy to make and impossible to see.
 */
export function triggerOrder<T extends TriggerCandidate>(flows: readonly T[]): T[] {
  return [...flows].sort((a, b) => {
    const fa = a.triggerType === 'any_message' ? 1 : 0;
    const fb = b.triggerType === 'any_message' ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  });
}

/** The flow this message starts, or null. Candidates must already be active. */
export function matchTrigger<T extends TriggerCandidate>(
  flows: readonly T[],
  signal: TriggerSignal,
): T | null {
  const now = signal.now ?? new Date();
  for (const flow of triggerOrder(flows)) {
    if (!triggerFires(flow, signal)) continue;
    // Checked after the trigger, not before: a flow that is out of hours should
    // not stop the next candidate from being considered, and that is exactly
    // what an after-hours pair needs.
    if (!isWithinWindow(flow.activeWindow, now)) continue;
    return flow;
  }
  return null;
}

/** Whether any candidate would need the ad id to be looked up. */
export function needsAdId(flows: readonly TriggerCandidate[]): boolean {
  return flows.some((f) => f.triggerType === 'ad_click');
}

/** A sentence for the editor and the flow summary. */
export function describeTriggerType(
  type: string | null | undefined,
  value: string | null | undefined,
): string {
  const v = (value ?? '').trim();
  switch (type) {
    case 'first_message':  return 'When someone messages for the first time';
    // Curly quotes, matching the prose in lib/flow-summary.ts — this string is
    // the start of that sentence as often as it is a label.
    //
    // "contains", not "says": the match is a substring, and reading it as
    // equality is exactly the misunderstanding behind one keyword silently
    // hiding inside another.
    case 'keyword':        return v ? `When a message contains “${v}”` : 'When a message contains a word you have not set yet';
    case 'button':         return v ? `When someone taps “${v}”` : 'When someone taps any button';
    case 'ad_click':       return v ? `When someone arrives from ad ${v}` : 'When someone arrives from any Meta ad';
    case 'campaign_reply': return v ? 'When someone replies to that campaign' : 'When someone replies to any campaign';
    case 'manual':         return 'Only when you or your system starts it';
    case 'any_message':    return 'When any message arrives and no other flow matched';
    default:               return 'No trigger set';
  }
}

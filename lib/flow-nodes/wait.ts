import type { NodeHandler } from './types';

// Pauses the flow and resumes it later. This is the node three live flows named
// "Nurture Flow" were missing: with no way to wait, every message in them fired
// in the same second.
//
// It sleeps rather than waits — a message arriving in the meantime is answered
// normally by the bot and does not advance the flow. A two-day follow-up must
// not silence the customer for two days.
//
// India has no daylight saving, so a fixed +05:30 is exact for "at 10am"
// and avoids a timezone dependency.
const IST_OFFSET_MIN = 330;

export interface WaitNodeData {
  label?: string;
  /** 'duration' waits a span; 'time' waits for a clock time. Default 'duration'. */
  mode?: 'duration' | 'time';
  minutes?: number;
  hours?: number;
  days?: number;
  /** "HH:MM" in IST, for mode 'time'. */
  atTime?: string;
  /** 0 = Sunday … 6 = Saturday. With atTime, waits for that weekday. */
  weekday?: number;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function istParts(d: Date): { y: number; m: number; day: number; weekday: number } {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * MINUTE);
  return {
    y: ist.getUTCFullYear(), m: ist.getUTCMonth(),
    day: ist.getUTCDate(), weekday: ist.getUTCDay(),
  };
}

/**
 * When this node should wake. Pure, so the awkward cases have tests rather than
 * comments: a clock time already past today rolls to tomorrow, and a duration of
 * zero still goes through the queue a minute out instead of firing inline.
 */
export function computeWakeAt(d: WaitNodeData, now: Date): Date {
  if (d.mode === 'time' && d.atTime && /^\d{1,2}:\d{2}$/.test(d.atTime)) {
    const [hh, mm] = d.atTime.split(':').map(Number) as [number, number];
    const p = istParts(now);
    // Build the IST wall clock, then shift back to real time.
    let wake = new Date(Date.UTC(p.y, p.m, p.day, hh, mm) - IST_OFFSET_MIN * MINUTE);
    while (wake.getTime() <= now.getTime()) wake = new Date(wake.getTime() + DAY);
    if (typeof d.weekday === 'number' && d.weekday >= 0 && d.weekday <= 6) {
      // At most seven hops; the loop cannot run away.
      for (let i = 0; i < 7 && istParts(wake).weekday !== d.weekday; i++) {
        wake = new Date(wake.getTime() + DAY);
      }
    }
    return wake;
  }

  const span =
    (d.days ?? 0) * DAY +
    (d.hours ?? 0) * 60 * MINUTE +
    (d.minutes ?? 0) * MINUTE;
  // A zero or negative wait would otherwise resume before the cron can see it.
  return new Date(now.getTime() + Math.max(span, MINUTE));
}

export const waitHandler: NodeHandler = {
  type: 'wait',
  async run(ctx) {
    const d = ctx.node.data as WaitNodeData;
    await ctx.ops.schedule(computeWakeAt(d, new Date()).toISOString(), 'default');
    return { outcome: { next: 'sleep' } };
  },
};

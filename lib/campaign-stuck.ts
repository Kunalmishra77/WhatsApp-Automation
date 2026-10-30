// lib/campaign-stuck.ts
//
// Whether a campaign run has died, or is simply taking a long time.
//
// Getting this wrong is not a small mistake. The old test was "the job started
// more than 20 minutes ago", on the assumption that a run going that long must
// be a dead serverless request. This platform deploys to Coolify, where nothing
// kills a route handler, and real campaigns here run for hours — so the test
// fired during live sends, the queue handed the job straight back to itself,
// and a second executor started on a campaign the first was still working
// through. 27,203 phone numbers received the same campaign twice or more:
// 30,686 extra sends, all of them delivered and charged for.
//
// The right question is not "how long has this been going?" but "has anything
// happened lately?". Pure, because that distinction is worth a test.

/** The gap of total silence after which a run is taken to be dead. */
export const STUCK_AFTER_MS = 20 * 60 * 1000;

export interface StuckInput {
  /** When the queue job was claimed. */
  startedAt: string | null;
  /** The most recent `campaign_recipients.sent_at` for this campaign, if any. */
  lastSentAt: string | null;
  /** Defaults to now. */
  now?: Date;
}

/**
 * True when the run should be reset and handed back to the queue.
 *
 * Three cases, and the middle one is the fix:
 *
 *  * Started recently — not stuck, whatever else is true.
 *  * Started long ago, but sent something recently — **working**. This is every
 *    large campaign on the platform, and it is what the old test got wrong.
 *  * Started long ago and silent since — dead. Reset it.
 *
 * A job with no `startedAt` is not processing, so it is not this function's
 * business. A job that has been going a long time and has sent nothing at all
 * is stuck on resolving its audience, and resetting it is right.
 */
export function isRunStuck({ startedAt, lastSentAt, now = new Date() }: StuckInput): boolean {
  if (!startedAt) return false;

  const cutoff = now.getTime() - STUCK_AFTER_MS;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started) || started > cutoff) return false;

  if (!lastSentAt) return true;
  const lastSent = Date.parse(lastSentAt);
  // An unparseable timestamp is treated as no heartbeat rather than as a recent
  // one: resetting a dead run costs a resumed campaign, and the dedup covers
  // what it already sent. Trusting a bad value costs a second live run.
  if (!Number.isFinite(lastSent)) return true;

  return lastSent <= cutoff;
}

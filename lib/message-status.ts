// lib/message-status.ts
//
// Which delivery receipts are allowed to change a message's status.
//
// handleStatusUpdate applied every receipt Meta sent, unconditionally, and that
// did two things wrong.
//
// It downgraded. The campaign_recipients half of that function is careful never
// to let a late receipt overwrite a terminal state; the messages half had no
// such guard, so a `delivered` receipt arriving after `read` set the message
// back to delivered. The table currently holds 51,107 delivered against 31,477
// read, and some of that gap is reads that were overwritten — which is a
// client-visible under-count of their read rate.
//
// And it wrote for nothing. Outbound messages are inserted with status 'sent',
// so the `sent` receipt that follows changes no column — yet with the table on
// REPLICA IDENTITY FULL (needed for Realtime's RLS check, migration 047) every
// one of those no-op updates still copied the entire old row, `content` and
// `meta` included, into the WAL. Realtime's WAL decoding is the single largest
// consumer of database time on this platform.

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

/** Declaration order of the message_status enum: queued → … → failed. */
export const MESSAGE_STATUS_RANK: Record<MessageStatus, number> = {
  queued: 1, sent: 2, delivered: 3, read: 4, failed: 5,
};

export function isMessageStatus(value: string): value is MessageStatus {
  return value in MESSAGE_STATUS_RANK;
}

/**
 * The statuses a row may currently hold for `next` to be an advance on it.
 *
 * Used as an `IN` filter, so the database decides whether the row has moved on
 * since the receipt was sent — no read-then-write, and therefore no race with
 * the receipt that arrives a moment later.
 *
 * `failed` may only follow queued or sent. A message that was delivered or read
 * did not fail, and recording one would corrupt the same reporting the guard is
 * there to protect; the caller logs when it drops one rather than hiding it.
 */
export function priorStatusesFor(next: MessageStatus): MessageStatus[] {
  if (next === 'failed') return ['queued', 'sent'];
  const ceiling = MESSAGE_STATUS_RANK[next];
  return (Object.keys(MESSAGE_STATUS_RANK) as MessageStatus[])
    .filter((s) => s !== 'failed' && MESSAGE_STATUS_RANK[s] < ceiling);
}

// ── Counting them ──────────────────────────────────────────────────────────────
//
// Every dashboard and analytics page used to count each delivery bucket with
// its own exact count — four to six scans of the same rows per page load, 272
// seconds of database time since 17 Sept. `analytics_message_status_counts`
// (migration 136) answers all of them in one GROUP BY; these turn its rows into
// the two shapes the pages actually render.

export interface MessageStatusCountRow {
  direction: string | null;
  status: string | null;
  cnt: number | string | null;
}

export type MessageStatusTally = Record<MessageStatus, number>;

const EMPTY_TALLY = (): MessageStatusTally => ({
  queued: 0, sent: 0, delivered: 0, read: 0, failed: 0,
});

/**
 * One row per status, exclusive — exactly what `.eq('status', s)` returned.
 *
 * A row with a status outside the enum, or null, is dropped rather than folded
 * into a bucket it does not belong to. `status` is nullable on the table (it
 * defaults to 'queued' and no row currently holds null), and the counts this
 * replaces excluded null too: `.eq` and `.in` both do.
 */
export function tallyMessageStatuses(
  rows: MessageStatusCountRow[] | null | undefined,
  direction: 'inbound' | 'outbound',
): MessageStatusTally {
  const tally = EMPTY_TALLY();
  for (const row of rows ?? []) {
    if (row.direction !== direction) continue;
    const status = row.status;
    if (!status || !isMessageStatus(status)) continue;
    tally[status] += Number(row.cnt ?? 0);
  }
  return tally;
}

/**
 * The cumulative funnel the dashboards show: a read message was also delivered,
 * and a delivered one was also sent.
 *
 * Deliberately outbound-only and deliberately cumulative — inbound rows are
 * stored delivered/read at ingestion, so an undirected status breakdown counts
 * a customer's own messages as delivery successes. Three routes derived these
 * same buckets separately; drift between them was a question of when, not if.
 */
export function outboundDeliveryFunnel(tally: MessageStatusTally): {
  queued: number; sent: number; delivered: number; read: number; failed: number;
} {
  return {
    queued: tally.queued,
    sent: tally.sent + tally.delivered + tally.read,
    delivered: tally.delivered + tally.read,
    read: tally.read,
    failed: tally.failed,
  };
}

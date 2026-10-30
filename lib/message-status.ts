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

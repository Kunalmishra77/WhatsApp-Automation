-- 130 — Restore the reads that late delivery receipts overwrote.
--
-- Meta re-sends and reorders delivery receipts. handleStatusUpdate applied every
-- one unconditionally to `messages`, and to `campaign_recipients` it guarded
-- only 'replied' and 'filtered' — so a `delivered` receipt arriving after `read`
-- set the row back to delivered, in both tables.
--
-- The damage is recoverable because the timestamps were never rolled back: the
-- row still carries read_at. A row with read_at set and status 'delivered' was
-- read and then overwritten; nothing else produces that combination.
--
--   messages             686 rows, all 13 workspaces, 7 June to 27 October
--   campaign_recipients  746 rows
--
-- campaign_recipients is the one clients see. A campaign's read_count counts
-- status in ('read','replied'), so each overwritten row dropped a read out of
-- the client's report — which is part of why this platform's read rates have sat
-- below what Meta's own dashboard shows.
--
-- The same reasoning covers one more case in campaign_recipients: 1,580 rows
-- hold delivered_at and still say 'sent'. Those were delivered and then had a
-- 'sent' receipt applied over them. Restoring those raises delivered_count,
-- which is counted from status in ('delivered','read','replied').
--
-- The guard that stops this recurring ships with this migration in
-- lib/message-status.ts; without it these rows would be overwritten again.
--
-- Ordering matters below: promote to 'read' first, then fix the 'sent' rows.
-- A row with both read_at and delivered_at must end up 'read', and doing it in
-- this order means the second statement no longer sees it.

UPDATE public.messages
SET status = 'read'
WHERE read_at IS NOT NULL
  AND status = 'delivered';

UPDATE public.campaign_recipients
SET status = 'read'
WHERE read_at IS NOT NULL
  AND status = 'delivered';

UPDATE public.campaign_recipients
SET status = 'delivered'
WHERE delivered_at IS NOT NULL
  AND status = 'sent';

-- Recompute the three counts for every campaign whose recipients just changed,
-- using exactly the status sets the webhook's own re-aggregation uses, so the
-- numbers agree with what it will write next time a receipt arrives.
WITH touched AS (
  SELECT DISTINCT campaign_id
  FROM public.campaign_recipients
  WHERE campaign_id IS NOT NULL
    AND ((read_at IS NOT NULL AND status = 'read')
      OR (delivered_at IS NOT NULL AND status = 'delivered'))
),
counts AS (
  SELECT t.campaign_id,
         count(*) FILTER (WHERE r.status IN ('sent', 'delivered', 'read', 'replied')) AS sent_count,
         count(*) FILTER (WHERE r.status IN ('delivered', 'read', 'replied'))         AS delivered_count,
         count(*) FILTER (WHERE r.status IN ('read', 'replied'))                      AS read_count
  FROM touched t
  JOIN public.campaign_recipients r ON r.campaign_id = t.campaign_id
  GROUP BY t.campaign_id
)
UPDATE public.campaigns c
SET sent_count      = counts.sent_count,
    delivered_count = counts.delivered_count,
    read_count      = counts.read_count
FROM counts
WHERE c.id = counts.campaign_id
  AND (c.sent_count      IS DISTINCT FROM counts.sent_count
    OR c.delivered_count IS DISTINCT FROM counts.delivered_count
    OR c.read_count      IS DISTINCT FROM counts.read_count);

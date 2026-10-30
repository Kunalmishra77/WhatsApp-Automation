-- 131 — Finish what 130 started, and undo the part of it that worked backwards.
--
-- Migration 130 ran three statements in this order:
--
--   1. messages:            read_at set, status 'delivered'  -> 'read'
--   2. campaign_recipients: read_at set, status 'delivered'  -> 'read'
--   3. campaign_recipients: delivered_at set, status 'sent'  -> 'delivered'
--
-- A recipient row that holds both timestamps and was sitting at 'sent' is caught
-- by statement 3, which set it to 'delivered' — after statement 2 had already
-- gone past. So 452 rows ended at 'delivered' with read_at set: exactly the
-- state 130 was written to clear.
--
-- 130's own comment reasoned about this and named the wrong order. The promotion
-- to 'read' has to come last, because 'read' is the stronger of the two facts
-- and nothing may run after it that can pull a row back.
--
-- All 452 carry both timestamps, which confirms the cause: none of them reached
-- this state any other way. `messages` was untouched by statement 3 and is
-- already correct.
--
-- Nothing is added after this UPDATE. If a later repair is ever needed, it goes
-- in its own migration ahead of a promotion like this one, not behind it.

UPDATE public.campaign_recipients
SET status = 'read'
WHERE read_at IS NOT NULL
  AND status = 'delivered';

-- Re-aggregate the campaigns those rows belong to, with the same status sets the
-- webhook uses, so the numbers agree with what it writes on the next receipt.
WITH touched AS (
  SELECT DISTINCT campaign_id
  FROM public.campaign_recipients
  WHERE campaign_id IS NOT NULL
    AND read_at IS NOT NULL
    AND status = 'read'
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

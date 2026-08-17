-- 076_conversation_first_reply.sql
-- Fix the analytics "avg first response time": conversations.first_replied_at was only
-- ever set by the manual agent-send routes (app/api/messages/send, admin send), NOT by
-- the bot's auto-replies in the webhook. So the metric averaged only the handful of slow
-- human replies (~47h) instead of the bot's near-instant response. A trigger stamps
-- first_replied_at on the first OUTBOUND message from ANY path (bot/agent/flow/campaign),
-- so the metric reflects reality going forward; a one-time backfill corrects history.

-- Trigger: on an outbound message insert, set the conversation's first_replied_at if not
-- already set. Inbound inserts short-circuit in plpgsql; once set, the UPDATE matches 0
-- rows (indexed by id) so the per-insert overhead is negligible.
CREATE OR REPLACE FUNCTION public.set_conversation_first_reply() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.direction = 'outbound' THEN
    UPDATE public.conversations
    SET first_replied_at = NEW.created_at
    WHERE id = NEW.conversation_id AND first_replied_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_first_reply ON public.messages;
CREATE TRIGGER trg_conversation_first_reply
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.set_conversation_first_reply();

-- One-time backfill: the first outbound message at/after the conversation's creation
-- (a reply to the customer, not a campaign message sent before they wrote in). Also
-- corrects conversations whose only recorded first_replied_at was a later manual reply.
UPDATE public.conversations cv
SET first_replied_at = sub.first_out
FROM (
  SELECT m.conversation_id, min(m.created_at) AS first_out
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.direction = 'outbound' AND m.created_at >= c.created_at
  GROUP BY m.conversation_id
) sub
WHERE cv.id = sub.conversation_id
  AND (cv.first_replied_at IS NULL OR cv.first_replied_at > sub.first_out);

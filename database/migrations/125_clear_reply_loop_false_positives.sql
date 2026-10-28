-- 125 — Clear every conversation the old reply-loop limit silenced.
--
-- RUN THIS AFTER THE REDEPLOY, not before.
--
-- Migration 123 unpaused Sonia Bisht's conversation. It did not hold: the
-- running code still capped replies at 40 in 24 hours and her count was already
-- 41, so her next message re-tripped the guard and the bot went quiet again.
-- Between 11:00 and 11:35 she sent six more messages — two "Hello", a question
-- about losing weight, a "." and a "?" — and a human had to type "ok" by hand.
-- Nothing clears while the old limit is live, which is why the order matters.
--
-- The limit is 150 in code now. This clears the pause on any conversation whose
-- count is below that, so a lead silenced by the old threshold starts talking
-- again on her next message. The four genuine bot-to-bot loops sat at 437, 671,
-- 1709 and 2351 replies and stay paused.

UPDATE public.conversations
SET bot_paused = false,
    status     = CASE WHEN status = 'pending' THEN 'open' ELSE status END,
    meta       = (meta - 'auto_paused_reason' - 'auto_paused_at' - 'reply_loop_count')
                 || jsonb_build_object(
                      'reply_loop_cleared_at', now(),
                      'reply_loop_cleared_from_count', meta->>'reply_loop_count'
                    )
WHERE meta->>'auto_paused_reason' = 'reply_loop'
  AND COALESCE((meta->>'reply_loop_count')::int, 0) < 150;

-- Any flow session frozen on the node it was parked on when the pause landed.
-- The customer's answer was swallowed, so resuming would re-ask a question she
-- has already answered; the next message should start clean instead.
DELETE FROM public.flow_sessions s
USING public.conversations c
WHERE s.conversation_id = c.id
  AND s.status = 'active'
  AND c.meta ? 'reply_loop_cleared_at';

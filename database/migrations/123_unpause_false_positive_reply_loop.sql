-- 123 — Let Sonia Bisht's conversation talk again.
--
-- The reply-loop guard pauses a conversation the bot has answered more than 40
-- times in 24 hours. On the morning Fitness First launched its Diwali offer, a
-- real lead tapped through the flow, asked about price twice and re-sent the
-- trigger keyword. Reply 41 tripped the guard at 11:00, and her next five
-- messages — a button tap, "Know More" twice and a plain "Hello" — got nothing
-- back.
--
-- The limit is now 150 in code. The four conversations that were genuine
-- bot-to-bot loops sat at 437, 671, 1709 and 2351 replies, so they stay caught;
-- this one was never one of them.
--
-- Only the false positive is cleared. The real loops keep their pause: waking
-- them would restart four conversations that each traded hundreds of messages
-- with another company's bot.

UPDATE public.conversations
SET bot_paused = false,
    status     = 'open',
    meta       = (meta - 'auto_paused_reason' - 'auto_paused_at' - 'reply_loop_count')
                 || jsonb_build_object(
                      'reply_loop_false_positive_cleared_at', now(),
                      'reply_loop_false_positive_count', meta->>'reply_loop_count'
                    )
WHERE id = 'fbafcd34-bb1d-4973-974b-6ad9c98e5137'
  AND meta->>'auto_paused_reason' = 'reply_loop';

-- Her flow session is still parked on the "which day would you like to visit?"
-- question from 10:49, and the answer she gave at 10:52 was swallowed by the
-- pause. Clearing it lets the next message start cleanly instead of resuming a
-- question she has already answered.
DELETE FROM public.flow_sessions
WHERE conversation_id = 'fbafcd34-bb1d-4973-974b-6ad9c98e5137'
  AND status = 'active';

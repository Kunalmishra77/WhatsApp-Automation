-- 119 — Stop the bot-to-bot conversations already running.
--
-- Two automated agents that each decline the other's topic answer each other
-- forever. One Umang Hospital conversation traded 2,400 messages with a Vi
-- telecom support bot between June and October, each politely explaining it could
-- only help with its own business. The off-topic guard never fired: "I can only
-- assist with Vi services" is a civil, service-related sentence, so the
-- classifier scored it 'ok' and reset the counter every time.
--
-- The webhook now counts its own replies instead of trying to classify the other
-- side, and pauses at 40 in 24 hours. That guard only governs what happens next;
-- this closes the ones already open.
--
-- The threshold is deliberately far above real use. Across 60 days the median
-- conversation-day is 1 bot reply, the 95th percentile 13 and the 99th 28. Taking
-- only conversations with three separate days over 40, or a single day over 150,
-- selects four: peaks of 1175, 919, 210 and 168. The next one down peaked at 97
-- and is left alone — a busy day is not a loop, and pausing a real customer's bot
-- is worse than leaving one stale conversation running.
--
-- auto_paused_reason = 'reply_loop' is what makes the pause stick: the webhook
-- clears bot_paused when a resolved conversation reopens, and auto-resolve runs
-- every two hours, so without the marker a loop un-pauses itself within the hour.

WITH daily AS (
  SELECT conversation_id,
         (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
         count(*) AS replies
  FROM public.messages
  WHERE direction = 'outbound'
    AND campaign_id IS NULL
    AND created_at > now() - interval '90 days'
  GROUP BY 1, 2
),
loops AS (
  SELECT conversation_id,
         count(*) FILTER (WHERE replies > 40) AS days_over_40,
         max(replies)                          AS peak_day,
         sum(replies)                          AS total_replies
  FROM daily
  GROUP BY 1
  HAVING count(*) FILTER (WHERE replies > 40) >= 3
      OR max(replies) >= 150
)
UPDATE public.conversations c
SET bot_paused = true,
    status     = 'pending',
    meta       = coalesce(c.meta, '{}'::jsonb) || jsonb_build_object(
                   'auto_paused_reason', 'reply_loop',
                   'auto_paused_at',     now(),
                   'reply_loop_count',   l.total_replies,
                   'reply_loop_peak_day', l.peak_day
                 )
FROM loops l
WHERE c.id = l.conversation_id;

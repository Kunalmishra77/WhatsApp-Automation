-- 118 — Per-client bot health metrics for the admin panel.
--
-- The scope guardrail began refusing real customers on 13 Sep 2026 and nobody
-- noticed for six weeks: 313 refusals in one week, 27% of every reply, across six
-- clients and 130 distinct customers. It surfaced only when clients complained,
-- because no screen in the product showed it. This is that screen's data source.
--
-- The three numbers that would have caught it:
--   refusals   — the bot telling a customer it can only help with the business.
--                Detected from the reply text, since the guardrail lives in the
--                prompt and leaves no flag behind. Covers the English and Hindi
--                phrasings seen in production ("only help", "only assist", "केवल").
--   fallbacks  — "…will get back to you shortly", sent only when the AI call
--                itself fails, so it counts provider outages.
--   median_reply_sec — how long a customer waits. 11s is normal here; a jump
--                means something upstream is slow.
--
-- Text matching is a heuristic and will drift as personas change. It is honest
-- about direction and magnitude, which is what a watchdog needs.

CREATE OR REPLACE FUNCTION public.admin_bot_health(p_days int DEFAULT 7)
RETURNS TABLE (
  workspace_id      uuid,
  workspace_name    text,
  inbound           bigint,
  bot_replies       bigint,
  refusals          bigint,
  refused_contacts  bigint,
  fallbacks         bigint,
  median_reply_sec  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH win AS (
    SELECT (now() - make_interval(days => p_days)) AS since
  ),
  msg AS (
    SELECT m.workspace_id, m.conversation_id, m.direction, m.content,
           m.campaign_id, m.created_at
    FROM public.messages m, win
    WHERE m.created_at >= win.since
  ),
  counts AS (
    SELECT
      msg.workspace_id,
      count(*) FILTER (WHERE direction = 'inbound')                       AS inbound,
      count(*) FILTER (WHERE direction = 'outbound'
                         AND campaign_id IS NULL)                         AS bot_replies,
      count(*) FILTER (WHERE direction = 'outbound'
                         AND campaign_id IS NULL
                         AND (content ILIKE '%only help%'
                           OR content ILIKE '%only assist%'
                           OR content LIKE  '%केवल%'))                     AS refusals,
      count(DISTINCT conversation_id) FILTER (WHERE direction = 'outbound'
                         AND campaign_id IS NULL
                         AND (content ILIKE '%only help%'
                           OR content ILIKE '%only assist%'
                           OR content LIKE  '%केवल%'))                     AS refused_contacts,
      count(*) FILTER (WHERE direction = 'outbound'
                         AND content LIKE '%get back to you shortly%')     AS fallbacks
    FROM msg
    GROUP BY msg.workspace_id
  ),
  -- Latency: for each inbound, the first outbound within five minutes. Anything
  -- slower is a human replying, not the bot, and would distort the median.
  latency AS (
    SELECT i.workspace_id,
           extract(epoch FROM (
             SELECT min(o.created_at)
             FROM public.messages o
             WHERE o.conversation_id = i.conversation_id
               AND o.direction = 'outbound'
               AND o.created_at > i.created_at
               AND o.created_at < i.created_at + interval '5 minutes'
           ) - i.created_at) AS secs
    FROM msg i
    WHERE i.direction = 'inbound'
  )
  SELECT
    c.workspace_id,
    w.name AS workspace_name,
    c.inbound,
    c.bot_replies,
    c.refusals,
    c.refused_contacts,
    c.fallbacks,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.secs)::numeric, 1) AS median_reply_sec
  FROM counts c
  JOIN public.workspaces w ON w.id = c.workspace_id
  LEFT JOIN latency l ON l.workspace_id = c.workspace_id AND l.secs IS NOT NULL
  WHERE w.deleted_at IS NULL
  GROUP BY c.workspace_id, w.name, c.inbound, c.bot_replies, c.refusals,
           c.refused_contacts, c.fallbacks
  ORDER BY c.refusals DESC, c.inbound DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_bot_health(int) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.admin_bot_health(int) IS
  'Per-workspace bot quality for the admin panel: refusals, AI fallbacks and median reply latency over the last N days. Service-role only.';

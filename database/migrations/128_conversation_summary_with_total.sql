-- 128 — Fold `total` into the same scan, and stop it counting pairs.
--
-- Migration 127 fixed the eight summary counts. `total` was left coming from the
-- page query's own `count: 'exact'`, which embeds leads!inner whenever
-- temperature or stage is filtered — so it counts conversation-and-lead pairs,
-- and 222 conversations carry more than one lead row. Filter the inbox by Hot
-- and the number above the list is too high.
--
-- `total` cannot simply be a ninth FILTER on the old body, because it obeys
-- different rules from the summary:
--
--   * the summary is always spam-free, whatever tab is open;
--   * `total` shows spam and only spam when the Spam tab is open, and excludes
--     it otherwise;
--   * `total` respects the active flag (unread / replied / unanswered / spam);
--     the summary never does.
--
-- So the scan no longer filters spam itself. Each count carries its own spam
-- rule, which keeps everything in one pass over the same rows.
--
-- The two new parameters have defaults, so the currently deployed route — which
-- does not pass them — keeps working against this function until it is
-- redeployed. Without a flag, `total` is every non-spam conversation matching
-- the filters, which is what that route already shows.

-- Dropped by name, every overload, rather than by a spelled-out signature.
-- Adding a parameter changes the signature, so a DROP that names the old one
-- silently matches nothing if it is off by a type — and the CREATE below would
-- then add an overload instead of replacing anything, leaving two functions for
-- PostgREST to choose between when it is called with named arguments.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'conversation_summary'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE FUNCTION public.conversation_summary(
  p_workspace_id   uuid,
  p_today_from     timestamptz,
  p_week_from      timestamptz,
  p_month_from     timestamptz,
  p_agent_id       uuid    DEFAULT NULL,  -- set only for agent-role members
  p_date_from      timestamptz DEFAULT NULL,
  p_date_to        timestamptz DEFAULT NULL,
  p_channel        text    DEFAULT NULL,
  p_status         text    DEFAULT NULL,
  p_assigned_agent uuid    DEFAULT NULL,
  p_sentiment      text    DEFAULT NULL,
  p_campaign_id    uuid    DEFAULT NULL,
  p_label          text    DEFAULT NULL,
  p_temperature    text    DEFAULT NULL,
  p_stage          text    DEFAULT NULL,
  p_q_pattern      text    DEFAULT NULL,  -- already escaped and wrapped in %…%
  p_contact_ids    uuid[]  DEFAULT NULL,
  -- unread | replied | unanswered | spam, or null for the All tab.
  p_flag           text    DEFAULT NULL
)
RETURNS TABLE (
  new_today  bigint,
  new_week   bigint,
  new_month  bigint,
  hot        bigint,
  warm       bigint,
  cold       bigint,
  unanswered bigint,
  unread     bigint,
  total      bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT c.id, c.created_at, c.first_replied_at, c.unread_count, c.is_spam,
           l.temperature, l.stage
    FROM public.conversations c
    LEFT JOIN public.leads l ON l.conversation_id = c.id
    WHERE c.workspace_id = p_workspace_id
      AND (p_agent_id       IS NULL OR c.assigned_agent_id  = p_agent_id)
      AND (p_date_from      IS NULL OR c.created_at        >= p_date_from)
      AND (p_date_to        IS NULL OR c.created_at         < p_date_to)
      AND (p_channel        IS NULL OR c.channel            = p_channel)
      AND (p_status         IS NULL OR c.status::text       = p_status)
      AND (p_assigned_agent IS NULL OR c.assigned_agent_id  = p_assigned_agent)
      AND (p_sentiment      IS NULL OR c.sentiment          = p_sentiment)
      AND (p_campaign_id    IS NULL OR c.source_campaign_id = p_campaign_id)
      AND (p_label          IS NULL OR c.labels            @> ARRAY[p_label])
      -- `stage` applies to every count, the bucket breakdown included.
      AND (p_stage          IS NULL OR l.stage::text        = p_stage)
      AND (
        p_q_pattern IS NULL
        OR c.last_message ILIKE p_q_pattern
        OR (p_contact_ids IS NOT NULL AND c.contact_id = ANY (p_contact_ids))
      )
  )
  SELECT
    -- The summary is spam-free and `temperature` is folded in per count rather
    -- than into the scan, because the three buckets below must ignore it.
    count(DISTINCT id) FILTER (
      WHERE NOT is_spam AND created_at >= p_today_from
        AND (p_temperature IS NULL OR temperature = p_temperature)
    ),
    count(DISTINCT id) FILTER (
      WHERE NOT is_spam AND created_at >= p_week_from
        AND (p_temperature IS NULL OR temperature = p_temperature)
    ),
    count(DISTINCT id) FILTER (
      WHERE NOT is_spam AND created_at >= p_month_from
        AND (p_temperature IS NULL OR temperature = p_temperature)
    ),
    count(DISTINCT id) FILTER (WHERE NOT is_spam AND temperature = 'hot'),
    count(DISTINCT id) FILTER (WHERE NOT is_spam AND temperature = 'warm'),
    count(DISTINCT id) FILTER (WHERE NOT is_spam AND temperature = 'cold'),
    count(DISTINCT id) FILTER (
      WHERE NOT is_spam AND first_replied_at IS NULL
        AND (p_temperature IS NULL OR temperature = p_temperature)
    ),
    count(DISTINCT id) FILTER (
      WHERE NOT is_spam AND unread_count > 0
        AND (p_temperature IS NULL OR temperature = p_temperature)
    ),
    -- `total` is the list's own count: it follows the open tab, shows spam only
    -- on the Spam tab, and applies the temperature filter like the list does.
    count(DISTINCT id) FILTER (
      WHERE (CASE WHEN p_flag = 'spam' THEN is_spam ELSE NOT is_spam END)
        AND (p_temperature IS NULL OR temperature = p_temperature)
        AND (
          p_flag IS NULL
          OR p_flag = 'spam'
          OR (p_flag = 'unread'     AND unread_count > 0)
          OR (p_flag = 'replied'    AND first_replied_at IS NOT NULL)
          OR (p_flag = 'unanswered' AND first_replied_at IS NULL)
          -- An unrecognised flag counts as no flag, which is how the route's
          -- applyFlag() treats one.
          OR p_flag NOT IN ('unread', 'replied', 'unanswered', 'spam')
        )
    )
  FROM base;
$$;

COMMENT ON FUNCTION public.conversation_summary IS
  'Conversations page KPI counts and list total in one scan, replacing nine '
  'queries. hot/warm/cold deliberately ignore p_temperature so the breakdown '
  'stays whole; the summary is always spam-free while total follows p_flag. '
  'Counts DISTINCT conversations because leads is not 1:1. Migrations 127, 128.';

GRANT EXECUTE ON FUNCTION public.conversation_summary TO authenticated, service_role;

-- 127 — One pass over conversations instead of eight.
--
-- Opening the Conversations page costs nine queries: the page itself plus eight
-- `count: 'exact'` head requests, three of which (hot/warm/cold) embed
-- `leads!inner`. pg_stat_statements has the conversations-with-leads shape at
-- 74,202 calls and 18ms mean — 22 minutes of database time — and it is why
-- idx_leads_conversation shows 129 million scans against 8,765 lead rows.
--
-- An exact count has no LIMIT: it reads every matching row. At 12 workspaces
-- that is 18ms. The work grows with rows per workspace, so the same eight counts
-- are what turn one page load into seconds once a workspace has real history.
--
-- This computes all eight in a single scan with FILTER clauses. The route keeps
-- its own page query, so a load goes from nine queries to two.
--
-- PARITY IS THE WHOLE RISK HERE. Three details are easy to get wrong, and all
-- three are deliberate in the route:
--
--   1. hot/warm/cold ignore an active `temperature` filter on purpose, so the
--      three-way split always shows the full breakdown rather than only the
--      selected bucket. They DO respect `stage`. Every other count applies both.
--   2. The route uses `leads!inner`, so a conversation with no lead row is
--      absent from any count whose select carries the embed. A LEFT JOIN plus a
--      predicate on l.temperature / l.stage gives NULL for those rows, which
--      fails the predicate — the same outcome, without needing two joins.
--   3. `leads` is NOT 1:1 with conversations, whatever the route's comments say.
--      222 conversations carry more than one lead row — 453 rows between them,
--      one conversation with five. A plain count(*) over the join counts
--      conversation-and-lead pairs, not conversations.
--
-- Point 3 was found by running both shapes against production before writing
-- this, and it means the page is wrong today, not that this function has to be.
-- Ten of twelve workspaces see inflated hot/warm/cold counts right now, because
-- those three are the only summary counts that join leads: VMS shows 999 where
-- 923 conversations exist, Razorveda 2341 against 2304, Umang 2126 against 2092.
-- The other five counts never join, so they have always been right.
--
-- So this counts DISTINCT conversations throughout. unread, unanswered and the
-- three date buckets come out identical to the eight queries they replace — that
-- was verified per workspace. hot/warm/cold come out slightly LOWER, and that is
-- the fan-out being removed, not a regression. A client watching closely will see
-- those three numbers drop a little the day this ships.
--
-- Whether a conversation should have five leads at all is a separate question,
-- and a real one; this function does not answer it.
--
-- Every count excludes spam, matching the route's summary (which never varies
-- with the active flag).

CREATE OR REPLACE FUNCTION public.conversation_summary(
  p_workspace_id   uuid,
  p_today_from     timestamptz,
  p_week_from      timestamptz,
  p_month_from     timestamptz,
  -- Null means "not filtering on this", mirroring the route's `undefined`.
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
  -- Already escaped and wrapped in %…% by the caller, as the route does.
  p_q_pattern      text    DEFAULT NULL,
  p_contact_ids    uuid[]  DEFAULT NULL
)
RETURNS TABLE (
  new_today  bigint,
  new_week   bigint,
  new_month  bigint,
  hot        bigint,
  warm       bigint,
  cold       bigint,
  unanswered bigint,
  unread     bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT c.id, c.created_at, c.first_replied_at, c.unread_count, l.temperature, l.stage
    FROM public.conversations c
    LEFT JOIN public.leads l ON l.conversation_id = c.id
    WHERE c.workspace_id = p_workspace_id
      AND c.is_spam = false
      AND (p_agent_id       IS NULL OR c.assigned_agent_id  = p_agent_id)
      AND (p_date_from      IS NULL OR c.created_at        >= p_date_from)
      AND (p_date_to        IS NULL OR c.created_at         < p_date_to)
      AND (p_channel        IS NULL OR c.channel            = p_channel)
      AND (p_status         IS NULL OR c.status             = p_status)
      AND (p_assigned_agent IS NULL OR c.assigned_agent_id  = p_assigned_agent)
      AND (p_sentiment      IS NULL OR c.sentiment          = p_sentiment)
      AND (p_campaign_id    IS NULL OR c.source_campaign_id = p_campaign_id)
      AND (p_label          IS NULL OR c.labels            @> ARRAY[p_label])
      -- `stage` applies to every count, the bucket breakdown included.
      AND (p_stage          IS NULL OR l.stage              = p_stage)
      AND (
        p_q_pattern IS NULL
        OR c.last_message ILIKE p_q_pattern
        OR (p_contact_ids IS NOT NULL AND c.contact_id = ANY (p_contact_ids))
      )
  )
  SELECT
    -- `temperature`, unlike `stage`, is folded into each count rather than the
    -- WHERE, because the three buckets below must ignore it.
    count(DISTINCT id) FILTER (
      WHERE created_at >= p_today_from
        AND (p_temperature IS NULL OR temperature = p_temperature)
    ),
    count(DISTINCT id) FILTER (
      WHERE created_at >= p_week_from
        AND (p_temperature IS NULL OR temperature = p_temperature)
    ),
    count(DISTINCT id) FILTER (
      WHERE created_at >= p_month_from
        AND (p_temperature IS NULL OR temperature = p_temperature)
    ),
    count(DISTINCT id) FILTER (WHERE temperature = 'hot'),
    count(DISTINCT id) FILTER (WHERE temperature = 'warm'),
    count(DISTINCT id) FILTER (WHERE temperature = 'cold'),
    count(DISTINCT id) FILTER (
      WHERE first_replied_at IS NULL
        AND (p_temperature IS NULL OR temperature = p_temperature)
    ),
    count(DISTINCT id) FILTER (
      WHERE unread_count > 0
        AND (p_temperature IS NULL OR temperature = p_temperature)
    )
  FROM base;
$$;

COMMENT ON FUNCTION public.conversation_summary IS
  'Conversations page KPI counts in one scan. Replaces eight count:exact head '
  'queries. hot/warm/cold deliberately ignore p_temperature so the breakdown '
  'stays whole; every other count applies it. See migration 127.';

GRANT EXECUTE ON FUNCTION public.conversation_summary TO authenticated, service_role;

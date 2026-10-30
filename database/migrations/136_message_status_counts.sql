-- 136 — Six counts asking one question, and the index that made each one expensive.
--
-- Every dashboard and analytics page counts outbound messages by delivery
-- status over a date range. Each bucket was its own exact count, so one page
-- load ran the same scan four to six times with a different status filter:
--
--   /api/dashboard/overview      6 counts (4 current period + 2 previous)
--   /api/analytics/extended      4 counts
--   /api/analytics/detail        5 counts (type=delivery)
--
-- From pg_stat_statements, since 17 Sept, the two shapes those collapse into:
--
--   WHERE workspace_id AND direction AND status = $3       AND created_at range
--     2,841 calls   48.2 ms mean   136.9 s total
--   WHERE workspace_id AND direction AND status = ANY($3)  AND created_at range
--     2,846 calls   47.8 ms mean   135.9 s total
--
-- 272 seconds of database time to answer, over and over, what one GROUP BY
-- answers in a single pass. The RPC below is that pass.
--
-- Why each call cost 48 ms on an 84k-row table: `messages` is indexed on
-- workspace_id alone and on (conversation_id, created_at DESC). Neither can
-- serve "this workspace, this date range", so the planner combined them —
-- reading the conversation index end to end because created_at is its SECOND
-- column and cannot be seeked:
--
--   Bitmap Heap Scan on messages (actual time=8.643..14.661 rows=2645)
--     Recheck Cond: workspace_id = ... AND created_at >= ... AND created_at < ...
--     Filter: status = ANY(...) AND direction = 'outbound'
--     Rows Removed by Filter: 2414
--     Heap Blocks: exact=1343     Buffers: shared hit=1971
--     ->  Bitmap Index Scan on idx_messages_conversation (rows=17562)
--           Index Cond: created_at >= ... AND created_at < ...
--
-- 1,971 buffers per count, six times a page load, to total 2,645 rows.
--
-- (workspace_id, created_at) is the pair every one of these reads filters on,
-- and it is also what the existing analytics_message_daily and
-- analytics_message_heatmap RPCs filter on. direction and status ride along as
-- INCLUDE columns so the counts can be answered from the index alone.
--
-- Plain CREATE INDEX, not CONCURRENTLY: run-migration.mjs sends the file as one
-- multi-statement query, which Postgres runs in an implicit transaction.

CREATE INDEX IF NOT EXISTS idx_messages_workspace_created
  ON public.messages (workspace_id, created_at)
  INCLUDE (direction, status);

ANALYZE public.messages;

-- One scan, every bucket. Callers sum the statuses they care about, which is
-- what the counts did — `.in('status', [...])` and `.eq('status', ...)` both
-- exclude a NULL status, and so does summing named statuses here, so the
-- numbers do not move. direction is grouped rather than filtered: it costs
-- nothing in the same pass and saves a second round trip for inbound.
--
-- p_from inclusive, p_to EXCLUSIVE — matches lib/date-range.ts and migration 064.
CREATE OR REPLACE FUNCTION public.analytics_message_status_counts(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(direction text, status text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT direction::text, status::text, count(*)::bigint
  FROM public.messages
  WHERE workspace_id = p_workspace
    AND created_at >= p_from AND created_at < p_to
  GROUP BY 1, 2;
$$;

-- The admin platform-wide volume trend ran 12 counts — 2 directions × 6 months,
-- unscoped by workspace, 204 calls at 92.9 ms (19.0 s). Each one scanned the
-- table; one month-bucketed pass does the whole chart.
--
-- No workspace filter is deliberate: admin routes aggregate across all
-- workspaces. That also means the index above cannot help this one, and does
-- not need to — a single sequential pass is the right plan for a query that
-- reads most of the table anyway.
CREATE OR REPLACE FUNCTION public.admin_message_volume_monthly(
  p_from timestamptz, p_to timestamptz, p_tz text)
RETURNS TABLE(month date, direction text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('month', created_at AT TIME ZONE p_tz)::date AS month,
         direction::text, count(*)::bigint
  FROM public.messages
  WHERE created_at >= p_from AND created_at < p_to
  GROUP BY 1, 2 ORDER BY 1;
$$;

-- Service-role only, as migration 064 locked down its own: the routes call with
-- the admin client and have already authorized the workspace. SECURITY DEFINER
-- bypasses RLS, so reachable from `authenticated` these would read any
-- workspace's traffic.
REVOKE ALL ON FUNCTION public.analytics_message_status_counts(uuid,timestamptz,timestamptz)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_message_volume_monthly(timestamptz,timestamptz,text)
  FROM public, anon, authenticated;

-- ── A duplicate index on the write path ──────────────────────────────────────
--
-- `messages` carried two indexes with byte-identical definitions:
--
--   idx_messages_whatsapp_id        btree (whatsapp_msg_id) WHERE NOT NULL   10 MB
--   messages_whatsapp_msg_id_unique UNIQUE btree (same)     WHERE NOT NULL   11 MB
--
-- The unique one serves every lookup the other can, and the planner knows it:
--
--   messages_whatsapp_msg_id_unique   122,190 scans   42,486 tuples read
--   idx_messages_whatsapp_id            2,838 scans        1 tuple  read
--
-- So the duplicate returned one row in six weeks while being written on all
-- 30,430 message inserts measured in that period. Neither backs a constraint,
-- so dropping the non-unique one changes no guarantee and removes no plan —
-- which is why this one IS safe to drop blind, unlike idx_cr_workspace in
-- migration 135, where the surviving index had never been used in production.
DROP INDEX IF EXISTS public.idx_messages_whatsapp_id;

-- Left in place on purpose: idx_messages_workspace is now a prefix of the index
-- above, and its 40,036 scans read 263 million tuples — it is the index the
-- bitmap plans used to drag every row of a workspace through. It should become
-- redundant, but that has to be confirmed against real plans before dropping
-- the index the current ones depend on.

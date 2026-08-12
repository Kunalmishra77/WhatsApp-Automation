-- 064_analytics_aggregates.sql — SECURITY DEFINER aggregation RPCs for analytics.
-- Eliminates the PostgREST 1000-row cap by aggregating in SQL. Workspace-scoped.
-- p_from inclusive, p_to EXCLUSIVE (matches lib/date-range.ts fromUtc/toUtc).

CREATE OR REPLACE FUNCTION public.analytics_message_daily(
  p_workspace uuid, p_from timestamptz, p_to timestamptz, p_tz text)
RETURNS TABLE(day date, direction text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (created_at AT TIME ZONE p_tz)::date AS day, direction, count(*)::bigint
  FROM public.messages
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY 1, 2 ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.analytics_message_heatmap(
  p_workspace uuid, p_from timestamptz, p_to timestamptz, p_tz text)
RETURNS TABLE(dow int, hour int, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXTRACT(DOW FROM created_at AT TIME ZONE p_tz)::int AS dow,
         EXTRACT(HOUR FROM created_at AT TIME ZONE p_tz)::int AS hour,
         count(*)::bigint
  FROM public.messages
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
    AND direction = 'inbound'
  GROUP BY 1, 2;
$$;

CREATE OR REPLACE FUNCTION public.analytics_conversation_status(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT status, count(*)::bigint FROM public.conversations
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.analytics_lead_breakdown(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(stage text, temperature text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT stage::text, temperature, count(*)::bigint FROM public.leads
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY 1, 2;
$$;

-- Lock down: service-role only (routes call with the admin client).
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'analytics_message_daily(uuid,timestamptz,timestamptz,text)',
    'analytics_message_heatmap(uuid,timestamptz,timestamptz,text)',
    'analytics_conversation_status(uuid,timestamptz,timestamptz)',
    'analytics_lead_breakdown(uuid,timestamptz,timestamptz)'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon, authenticated;', fn);
  END LOOP;
END $$;

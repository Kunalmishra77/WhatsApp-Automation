-- 067_dashboard_aggregates.sql — SECURITY DEFINER aggregates for the command-center dashboard.
CREATE OR REPLACE FUNCTION public.analytics_campaign_totals(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(status text, campaigns bigint, recipients bigint, sent bigint, delivered bigint, read bigint, replied bigint, failed bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT status::text, count(*)::bigint,
         coalesce(sum(total_recipients),0)::bigint, coalesce(sum(sent_count),0)::bigint,
         coalesce(sum(delivered_count),0)::bigint, coalesce(sum(read_count),0)::bigint,
         coalesce(sum(replied_count),0)::bigint, coalesce(sum(failed_count),0)::bigint
  FROM public.campaigns
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY status;
$$;

CREATE OR REPLACE FUNCTION public.analytics_conversation_metrics(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(total bigint, resolved bigint, avg_first_response_secs numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE resolved_at IS NOT NULL)::bigint,
         avg(EXTRACT(EPOCH FROM (first_replied_at - created_at))) FILTER (WHERE first_replied_at IS NOT NULL)
  FROM public.conversations
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to;
$$;

DO $$ DECLARE fn text; BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'analytics_campaign_totals(uuid,timestamptz,timestamptz)',
    'analytics_conversation_metrics(uuid,timestamptz,timestamptz)'])
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon, authenticated;', fn); END LOOP;
END $$;

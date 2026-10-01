-- 106_ai_usage_reports.sql
-- Aggregation RPCs for the admin AI-tokens dashboard. SECURITY DEFINER + service-role
-- only (ai_usage is deny-all RLS). All take an inclusive [from, to] window.

create or replace function public.ai_usage_totals(p_from timestamptz, p_to timestamptz)
returns table (calls bigint, total_tokens bigint, cost_usd numeric)
language sql stable security definer set search_path = public as $$
  select count(*)::bigint, coalesce(sum(total_tokens),0)::bigint, coalesce(sum(cost_usd),0)::numeric
  from public.ai_usage where created_at >= p_from and created_at < p_to;
$$;

create or replace function public.ai_usage_by_provider(p_from timestamptz, p_to timestamptz)
returns table (provider text, calls bigint, total_tokens bigint, cost_usd numeric)
language sql stable security definer set search_path = public as $$
  select provider, count(*)::bigint, coalesce(sum(total_tokens),0)::bigint, coalesce(sum(cost_usd),0)::numeric
  from public.ai_usage where created_at >= p_from and created_at < p_to
  group by provider order by sum(cost_usd) desc nulls last;
$$;

create or replace function public.ai_usage_by_workspace(p_from timestamptz, p_to timestamptz)
returns table (workspace_id uuid, name text, calls bigint, total_tokens bigint, cost_usd numeric)
language sql stable security definer set search_path = public as $$
  select u.workspace_id, w.name, count(*)::bigint, coalesce(sum(u.total_tokens),0)::bigint, coalesce(sum(u.cost_usd),0)::numeric
  from public.ai_usage u
  left join public.workspaces w on w.id = u.workspace_id
  where u.created_at >= p_from and u.created_at < p_to
  group by u.workspace_id, w.name order by sum(u.cost_usd) desc nulls last;
$$;

revoke execute on function public.ai_usage_totals(timestamptz, timestamptz)       from public, anon, authenticated;
revoke execute on function public.ai_usage_by_provider(timestamptz, timestamptz)  from public, anon, authenticated;
revoke execute on function public.ai_usage_by_workspace(timestamptz, timestamptz) from public, anon, authenticated;

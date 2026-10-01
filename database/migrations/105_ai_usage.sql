-- 105_ai_usage.sql
-- AI token + cost tracking: one row per AI call (which client, provider, model,
-- tokens, estimated $), plus a per-provider balance/wallet for the low-balance
-- alert. Service-role only (financial/operational data) — deny-all RLS.

create table if not exists public.ai_usage (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid references public.workspaces(id) on delete set null,
  provider          text not null,                 -- OpenAI | OpenRouter
  model             text,
  task              text,                           -- auto_reply | vision | campaign_copy | gbp_reply | ...
  prompt_tokens     int  not null default 0,
  completion_tokens int  not null default 0,
  total_tokens      int  not null default 0,
  cost_usd          numeric(12,6) not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists idx_ai_usage_ws       on public.ai_usage (workspace_id, created_at desc);
create index if not exists idx_ai_usage_provider on public.ai_usage (provider, created_at desc);
create index if not exists idx_ai_usage_created   on public.ai_usage (created_at desc);

-- Per-provider wallet. For OpenRouter the balance is refreshed from its API; for
-- OpenAI there is no public balance API, so the admin sets it after each recharge
-- and we subtract logged spend since `balance_set_at`.
create table if not exists public.ai_provider_balances (
  provider          text primary key,              -- OpenAI | OpenRouter
  balance_usd       numeric(12,4),                 -- remaining (OpenRouter: cached; OpenAI: recharge amount)
  balance_set_at    timestamptz,                   -- when the admin set it (OpenAI) / last cache (OpenRouter)
  low_threshold_usd numeric(10,2) not null default 5,
  last_alerted_for  numeric(12,4),                 -- balance value we last alerted at (dedupe)
  updated_at        timestamptz not null default now()
);

insert into public.ai_provider_balances (provider) values ('OpenAI'), ('OpenRouter')
on conflict (provider) do nothing;

alter table public.ai_usage             enable row level security;
alter table public.ai_provider_balances enable row level security;
do $$ begin
  execute 'drop policy if exists ai_usage_no_client on public.ai_usage';
  execute 'create policy ai_usage_no_client on public.ai_usage for all using (false) with check (false)';
  execute 'drop policy if exists ai_balances_no_client on public.ai_provider_balances';
  execute 'create policy ai_balances_no_client on public.ai_provider_balances for all using (false) with check (false)';
end $$;

comment on table public.ai_usage is 'One row per AI API call — provider/model/tokens/estimated cost, attributed to a workspace.';
comment on table public.ai_provider_balances is 'Per-provider wallet for the low-balance (<$5) alert. OpenRouter cached from API; OpenAI set by admin on recharge.';

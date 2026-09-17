-- 090_google_ads_integration.sql
-- Phase 4 (Google Ads). Additive & non-breaking; every table workspace-scoped
-- with RLS. Part A (lead capture) uses only google_ads_lead_secrets; Part B
-- (reporting) uses google_ads_connections + google_ads_campaigns.

-- ── Reporting connection (Part B) ───────────────────────────────────────────
create table if not exists public.google_ads_connections (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null unique references public.workspaces(id) on delete cascade,
  refresh_token     text not null,
  customer_id       text,                 -- the Ads account being read (digits only)
  login_customer_id text,                 -- MCC id for manager access (optional)
  email             text,
  status            text not null default 'connected',
  connected_at      timestamptz not null default now(),
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now()
);

-- ── Cached campaign metrics (Part B) ────────────────────────────────────────
create table if not exists public.google_ads_campaigns (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  customer_id   text not null,
  campaign_id   text not null,
  name          text,
  status        text,
  channel_type  text,
  date          date not null,
  cost_micros   bigint not null default 0,   -- micros (1e6 = 1 currency unit)
  clicks        bigint not null default 0,
  impressions   bigint not null default 0,
  conversions   numeric not null default 0,
  raw           jsonb default '{}',
  created_at    timestamptz not null default now(),
  unique (workspace_id, campaign_id, date)
);

-- ── Per-workspace lead-form webhook secret (Part A) ─────────────────────────
create table if not exists public.google_ads_lead_secrets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  webhook_key  text not null,                -- shared key pasted into the Lead Form asset
  created_at   timestamptz not null default now()
);

create index if not exists idx_gads_campaigns_ws on public.google_ads_campaigns (workspace_id, date desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.google_ads_connections   enable row level security;
alter table public.google_ads_campaigns      enable row level security;
alter table public.google_ads_lead_secrets   enable row level security;

create policy "gads_connections_ws" on public.google_ads_connections
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "gads_campaigns_ws" on public.google_ads_campaigns
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "gads_lead_secrets_ws" on public.google_ads_lead_secrets
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

comment on table public.google_ads_lead_secrets is 'Phase 4 Part A: per-workspace key validating Google Ads Lead Form webhook posts.';

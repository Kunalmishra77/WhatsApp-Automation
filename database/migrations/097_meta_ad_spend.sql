-- 097_meta_ad_spend.sql
-- Phase: cross-channel ROI completion. Real Facebook/Instagram AD spend (via the
-- Meta Marketing API), per workspace/day/campaign. Distinct from meta_spend_daily
-- (which is WhatsApp messaging cost). Additive + RLS.

create table if not exists public.meta_ad_spend_daily (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  ad_account_id text not null,
  date          date not null,
  campaign_id   text,
  campaign_name text,
  spend         numeric not null default 0,     -- currency units (e.g. INR)
  impressions   bigint  not null default 0,
  clicks        bigint  not null default 0,
  currency      text,
  created_at    timestamptz not null default now(),
  unique (workspace_id, date, campaign_id)
);

create index if not exists idx_meta_ad_spend_ws on public.meta_ad_spend_daily (workspace_id, date desc);

alter table public.meta_ad_spend_daily enable row level security;
create policy "meta_ad_spend_ws" on public.meta_ad_spend_daily
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

comment on table public.meta_ad_spend_daily is
  'Real Facebook/Instagram ad spend via Meta Marketing API (NOT WhatsApp messaging cost).';

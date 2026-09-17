-- 092_gbp_report_leads.sql
-- "Free GBP Report" lead magnet — captures visitors who run a public GBP audit.
-- Platform-level (NOT workspace-scoped): these are AGENTiX's own marketing leads.
-- RLS locked to service-role only; the public API writes via the admin client.

create table if not exists public.gbp_report_leads (
  id             uuid primary key default gen_random_uuid(),
  business_name  text,
  place_id       text,
  query          text,
  score          int,
  grade          text,
  rating         numeric,
  review_count   int,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  report         jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_gbp_report_leads_created on public.gbp_report_leads (created_at desc);

alter table public.gbp_report_leads enable row level security;
-- No anon/authenticated access; the admin (service-role) client bypasses RLS and
-- is the only writer/reader (public API route + admin panel).
create policy "gbp_report_leads_service_only" on public.gbp_report_leads
  for all using (false) with check (false);

comment on table public.gbp_report_leads is
  'Free GBP Report lead magnet: captured business audits + contact details (AGENTiX marketing funnel).';

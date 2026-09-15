-- 087_lead_source_attribution.sql
-- Phase 1 (Unified Lead Hub): normalize where every lead/contact came from + a per-contact
-- touchpoint journey. Fully additive & non-breaking — new NULLABLE columns + one new table.
-- `leads.source` already exists (free text); we add a NORMALIZED `channel` + structured
-- attribution alongside it, so existing data/queries are untouched.

-- ── Normalized attribution columns on leads + contacts ──────────────────────────
alter table public.leads
  add column if not exists channel             text,
  add column if not exists source_detail       text,
  add column if not exists utm_source          text,
  add column if not exists utm_medium          text,
  add column if not exists utm_campaign        text,
  add column if not exists utm_content         text,
  add column if not exists utm_term            text,
  add column if not exists first_touch_channel text,
  add column if not exists first_touch_at      timestamptz,
  add column if not exists last_touch_channel  text,
  add column if not exists last_touch_at       timestamptz;

alter table public.contacts
  add column if not exists channel             text,
  add column if not exists source_detail       text,
  add column if not exists first_touch_channel text,
  add column if not exists first_touch_at      timestamptz,
  add column if not exists last_touch_channel  text,
  add column if not exists last_touch_at       timestamptz;

create index if not exists idx_leads_ws_channel    on public.leads    (workspace_id, channel);
create index if not exists idx_contacts_ws_channel on public.contacts (workspace_id, channel);

comment on column public.leads.channel is
  'Normalized acquisition channel: whatsapp|instagram|meta_ads|google_ads|gbp|website|chat_widget|campaign|api|referral|manual|other';

-- ── Marketing touchpoints (the cross-channel journey timeline) ──────────────────
create table if not exists public.marketing_touchpoints (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,
  channel       text not null,           -- same vocabulary as leads.channel
  source_detail text,                    -- campaign name, ad id, gbp location, form name, ...
  ref_type      text,                    -- conversation|campaign|meta_lead|google_lead|gbp_review|form|manual
  ref_id        text,                    -- id of the originating record (varies by ref_type)
  occurred_at   timestamptz not null default now(),
  metadata      jsonb default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_touchpoints_ws_contact on public.marketing_touchpoints (workspace_id, contact_id, occurred_at desc);
create index if not exists idx_touchpoints_ws_channel  on public.marketing_touchpoints (workspace_id, channel, occurred_at desc);

alter table public.marketing_touchpoints enable row level security;
create policy "touchpoints_workspace" on public.marketing_touchpoints
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

comment on table public.marketing_touchpoints is
  'Every marketing/lead touchpoint per contact across all channels — powers unified attribution + the customer-journey timeline (Phase 1).';

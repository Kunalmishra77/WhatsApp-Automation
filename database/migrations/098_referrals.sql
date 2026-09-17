-- 098_referrals.sql
-- Referral / affiliate program: each customer gets a shareable code; new people
-- who sign up via that code are attributed to the referrer. Additive + RLS.

-- One code per contact (globally unique so the /r/<code> link needs no workspace).
create table if not exists public.referral_codes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  code         text not null unique,
  created_at   timestamptz not null default now(),
  unique (workspace_id, contact_id)
);

-- Each referral event.
create table if not exists public.referrals (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  referrer_contact_id uuid references public.contacts(id) on delete set null,
  referred_contact_id uuid references public.contacts(id) on delete set null,
  referred_name       text,
  referred_phone      text,
  code                text,
  status              text not null default 'pending',   -- pending | joined | converted | rewarded
  reward_amount       numeric,
  created_at          timestamptz not null default now()
);

create index if not exists idx_referrals_ws        on public.referrals (workspace_id, created_at desc);
create index if not exists idx_referrals_referrer  on public.referrals (workspace_id, referrer_contact_id);

alter table public.referral_codes enable row level security;
alter table public.referrals      enable row level security;
create policy "referral_codes_ws" on public.referral_codes
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "referrals_ws" on public.referrals
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

comment on table public.referrals is 'Referral/affiliate program events — who referred whom, status and reward.';

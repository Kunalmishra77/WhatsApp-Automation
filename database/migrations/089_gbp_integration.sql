-- 089_gbp_integration.sql
-- Phase 2 (Google Business Profile). Additive & non-breaking: six new tables,
-- each workspace-scoped with RLS via public.is_workspace_member. Refresh tokens
-- are stored per workspace (same trust model as the existing Google Calendar
-- integration). Nothing here touches existing tables.

-- ── Connection (one per workspace) ──────────────────────────────────────────
create table if not exists public.gbp_connections (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null unique references public.workspaces(id) on delete cascade,
  google_account_id text,
  account_name      text,
  email             text,
  refresh_token     text not null,
  scope             text,
  status            text not null default 'connected',   -- connected | revoked | error
  connected_at      timestamptz not null default now(),
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now()
);

-- ── Locations (a workspace may manage several) ──────────────────────────────
create table if not exists public.gbp_locations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.gbp_connections(id) on delete cascade,
  location_id   text not null,                 -- Google location resource id/name
  title         text,
  address       text,
  primary_phone text,
  website_uri   text,
  is_active     boolean not null default true,
  raw           jsonb default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, location_id)
);

-- ── Reviews ─────────────────────────────────────────────────────────────────
create table if not exists public.gbp_reviews (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  location_id        text not null,
  review_id          text not null,            -- Google review resource id
  reviewer_name      text,
  reviewer_photo_url text,
  star_rating        int,                       -- 1..5
  comment            text,
  create_time        timestamptz,
  update_time        timestamptz,
  reply_comment      text,
  reply_update_time  timestamptz,
  reply_status       text not null default 'none',  -- none | draft | approved | posted
  ai_draft           text,
  raw                jsonb default '{}',
  created_at         timestamptz not null default now(),
  unique (workspace_id, review_id)
);

-- ── Local posts ─────────────────────────────────────────────────────────────
create table if not exists public.gbp_posts (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id  text not null,
  post_id      text,                            -- null until published to Google
  topic_type   text not null default 'STANDARD',-- STANDARD | OFFER | EVENT | ALERT
  summary      text,
  media_url    text,
  cta_type     text,                            -- BOOK | ORDER | LEARN_MORE | CALL | ...
  cta_url      text,
  status       text not null default 'draft',   -- draft | approved | published | failed
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  raw          jsonb default '{}',
  created_at   timestamptz not null default now()
);

-- ── Questions & Answers ─────────────────────────────────────────────────────
create table if not exists public.gbp_questions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  location_id   text not null,
  question_id   text not null,
  author_name   text,
  text          text,
  create_time   timestamptz,
  answer_text   text,
  answer_status text not null default 'none',   -- none | draft | approved | posted
  ai_draft      text,
  raw           jsonb default '{}',
  created_at    timestamptz not null default now(),
  unique (workspace_id, question_id)
);

-- ── Insights (cached daily performance metrics) ─────────────────────────────
create table if not exists public.gbp_insights_daily (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id  text not null,
  date         date not null,
  metric       text not null,                   -- e.g. BUSINESS_IMPRESSIONS_*, CALL_CLICKS, ...
  value        bigint not null default 0,
  created_at   timestamptz not null default now(),
  unique (workspace_id, location_id, date, metric)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_gbp_locations_ws        on public.gbp_locations   (workspace_id);
create index if not exists idx_gbp_reviews_ws_loc      on public.gbp_reviews     (workspace_id, location_id, create_time desc);
create index if not exists idx_gbp_reviews_ws_status   on public.gbp_reviews     (workspace_id, reply_status);
create index if not exists idx_gbp_posts_ws_loc        on public.gbp_posts       (workspace_id, location_id, created_at desc);
create index if not exists idx_gbp_questions_ws_status on public.gbp_questions   (workspace_id, answer_status);
create index if not exists idx_gbp_insights_ws_loc     on public.gbp_insights_daily (workspace_id, location_id, date desc);

-- ── RLS (workspace-scoped, matches the post-audit standard) ─────────────────
alter table public.gbp_connections   enable row level security;
alter table public.gbp_locations     enable row level security;
alter table public.gbp_reviews       enable row level security;
alter table public.gbp_posts         enable row level security;
alter table public.gbp_questions     enable row level security;
alter table public.gbp_insights_daily enable row level security;

create policy "gbp_connections_ws"  on public.gbp_connections
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "gbp_locations_ws"    on public.gbp_locations
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "gbp_reviews_ws"      on public.gbp_reviews
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "gbp_posts_ws"        on public.gbp_posts
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "gbp_questions_ws"    on public.gbp_questions
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "gbp_insights_ws"     on public.gbp_insights_daily
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

comment on table public.gbp_connections is 'Phase 2: per-workspace Google Business Profile OAuth connection (business.manage).';
comment on table public.gbp_reviews is 'Phase 2: cached GBP reviews + AI-drafted / human-approved replies.';

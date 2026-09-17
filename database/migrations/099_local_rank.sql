-- 099_local_rank.sql
-- Local rank tracker: track where the business's Google listing ranks for a set
-- of local search keywords over time, using Places Text Search (New). Additive + RLS.

create table if not exists public.local_rank_keywords (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  keyword       text not null,
  area          text,                      -- optional locality, e.g. "Indore"
  place_id      text,                      -- target business's Google Places id (resolved on add)
  location_lat  double precision,          -- search bias centre
  location_lng  double precision,
  created_at    timestamptz not null default now()
);

create index if not exists idx_local_rank_keywords_ws on public.local_rank_keywords (workspace_id, created_at desc);
create unique index if not exists uq_local_rank_keyword
  on public.local_rank_keywords (workspace_id, lower(keyword), coalesce(lower(area), ''));

create table if not exists public.local_rank_snapshots (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  keyword_id    uuid not null references public.local_rank_keywords(id) on delete cascade,
  checked_on    date not null default (now() at time zone 'utc')::date,
  rank          int,                       -- null = not found in the top results
  found         boolean not null default false,
  top_result    text,                      -- name of the #1 result for the keyword
  created_at    timestamptz not null default now()
);

create index if not exists idx_local_rank_snapshots_kw on public.local_rank_snapshots (keyword_id, checked_on desc);
create unique index if not exists uq_local_rank_snapshot on public.local_rank_snapshots (keyword_id, checked_on);

alter table public.local_rank_keywords  enable row level security;
alter table public.local_rank_snapshots enable row level security;
create policy "local_rank_keywords_ws" on public.local_rank_keywords
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "local_rank_snapshots_ws" on public.local_rank_snapshots
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

comment on table public.local_rank_keywords is 'Keywords whose local Google ranking we track per workspace.';
comment on table public.local_rank_snapshots is 'Daily rank position for a tracked keyword (null rank = outside top results).';

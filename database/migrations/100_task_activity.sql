-- 100_task_activity.sql
-- Advanced team work tracking: an activity/comment log per task so assigned work
-- has visible history — comments, status changes, (re)assignments. Additive + RLS.

create table if not exists public.task_activity (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  type         text not null default 'comment'
               check (type in ('comment','status_change','assignment','created','due_change')),
  body         text,                       -- comment text or human-readable change
  meta         jsonb not null default '{}'::jsonb,  -- {from,to} for changes
  created_at   timestamptz not null default now()
);

create index if not exists idx_task_activity_task on public.task_activity (task_id, created_at asc);
create index if not exists idx_task_activity_ws   on public.task_activity (workspace_id, created_at desc);

alter table public.task_activity enable row level security;
create policy "task_activity_ws" on public.task_activity
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

comment on table public.task_activity is 'Per-task activity log: comments + status/assignment/due changes for team work tracking.';

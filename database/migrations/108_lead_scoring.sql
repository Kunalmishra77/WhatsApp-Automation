-- 108_lead_scoring.sql
-- Unified lead scoring: a single AI-derived score (0-100) is the source of truth;
-- temperature (hot/warm/cold) is DERIVED from it. Replaces the old single-message
-- keyword temperature. Additive + explainable + audited.

alter table public.leads
  add column if not exists lead_score       int,              -- 0-100, AI-derived from conversation
  add column if not exists score_confidence int,              -- 0-100, AI certainty
  add column if not exists score_signals    jsonb not null default '[]'::jsonb; -- reasons that drove the score

-- Audit trail: one row per temperature-band transition (Cold→Warm→Hot→Converted).
create table if not exists public.lead_score_history (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  lead_id          uuid not null references public.leads(id) on delete cascade,
  from_temperature text,
  to_temperature   text,
  score            int,
  confidence       int,
  reason           text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_lead_score_history_lead on public.lead_score_history (lead_id, created_at desc);
create index if not exists idx_lead_score_history_ws   on public.lead_score_history (workspace_id, created_at desc);

alter table public.lead_score_history enable row level security;
create policy "lead_score_history_ws" on public.lead_score_history
  for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

comment on column public.leads.lead_score is 'Unified 0-100 lead score (AI, conversation-based). Temperature is derived from this.';
comment on table public.lead_score_history is 'Audit trail of temperature-band transitions with the score/reason at each change.';

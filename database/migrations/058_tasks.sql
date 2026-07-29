-- ── 058_tasks.sql ────────────────────────────────────────────────────────────
-- Task management: clients assign and track tasks for their team. Workspace-
-- scoped, RLS-isolated like every other tenant table.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS public.tasks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title                   VARCHAR(255) NOT NULL,
  description             TEXT,
  assigned_to             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                  VARCHAR(20) NOT NULL DEFAULT 'todo'   CHECK (status IN ('todo','in_progress','done')),
  priority                VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date                TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  related_contact_id      UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  related_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON public.tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned         ON public.tasks(workspace_id, assigned_to);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_workspace" ON public.tasks;
CREATE POLICY "tasks_workspace" ON public.tasks
  FOR ALL USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;

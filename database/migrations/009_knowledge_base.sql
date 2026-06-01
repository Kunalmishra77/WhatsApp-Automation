BEGIN;

CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  content      TEXT NOT NULL,
  category     VARCHAR(100) DEFAULT 'general',
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_workspace ON public.knowledge_base(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kb_active    ON public.knowledge_base(workspace_id, is_active);

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kb_workspace" ON public.knowledge_base;
CREATE POLICY "kb_workspace" ON public.knowledge_base FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;

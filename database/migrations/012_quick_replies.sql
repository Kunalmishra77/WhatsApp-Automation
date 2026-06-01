BEGIN;

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  shortcut     VARCHAR(50)  NOT NULL,  -- e.g. "/thanks", "/price"
  title        VARCHAR(255) NOT NULL,
  content      TEXT NOT NULL,
  category     VARCHAR(100) DEFAULT 'general',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, shortcut)
);

CREATE INDEX IF NOT EXISTS idx_qr_workspace ON public.quick_replies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_qr_shortcut  ON public.quick_replies(workspace_id, shortcut);

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_workspace" ON public.quick_replies;
CREATE POLICY "qr_workspace" ON public.quick_replies FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;

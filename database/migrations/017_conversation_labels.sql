BEGIN;

-- Workspace-defined labels for conversations
CREATE TABLE IF NOT EXISTS public.workspace_labels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(50) NOT NULL,
  color        VARCHAR(20) NOT NULL DEFAULT 'gray',  -- gray|red|orange|amber|green|blue|purple|pink
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

ALTER TABLE public.workspace_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wl_workspace" ON public.workspace_labels;
CREATE POLICY "wl_workspace" ON public.workspace_labels FOR ALL
  USING  (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

-- conversations.labels TEXT[] already exists in migration 002

-- Seed default labels for existing workspaces (optional — runs only if table was just created)
-- Users can delete/rename these via Settings

COMMIT;

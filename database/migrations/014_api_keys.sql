BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  key_hash     VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of the key
  key_prefix   VARCHAR(12) NOT NULL,        -- first 8 chars shown in UI (e.g. "agx_live_")
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,                 -- NULL = never expires
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON public.workspace_api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash      ON public.workspace_api_keys(key_hash);

ALTER TABLE public.workspace_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_workspace" ON public.workspace_api_keys;
CREATE POLICY "api_keys_workspace" ON public.workspace_api_keys FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;

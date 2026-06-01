BEGIN;

-- SLA policies per workspace
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
  is_enabled            BOOLEAN DEFAULT false,
  first_response_hours  NUMERIC(4,1) DEFAULT 1,   -- e.g. 1.5 = 1hr 30min
  resolution_hours      NUMERIC(4,1) DEFAULT 24,
  breach_notify_email   BOOLEAN DEFAULT false,
  breach_notify_agents  BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Add SLA tracking columns to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS first_replied_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_first_breach  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_resolve_breach BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conversations_sla ON public.conversations(workspace_id, sla_first_breach, status);

ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sla_workspace" ON public.sla_policies;
CREATE POLICY "sla_workspace" ON public.sla_policies FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;

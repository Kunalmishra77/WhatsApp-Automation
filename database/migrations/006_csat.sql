BEGIN;

CREATE TABLE IF NOT EXISTS public.csat_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES public.contacts(id),
  agent_id        UUID REFERENCES public.profiles(id),
  score           INTEGER CHECK (score BETWEEN 1 AND 5),
  comment         TEXT,
  responded_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csat_workspace     ON public.csat_responses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_csat_conversation  ON public.csat_responses(conversation_id);

ALTER TABLE public.csat_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csat_workspace" ON public.csat_responses;
CREATE POLICY "csat_workspace" ON public.csat_responses
  FOR ALL USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;

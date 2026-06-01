BEGIN;
CREATE TABLE IF NOT EXISTS public.follow_up_sequences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  is_active    BOOLEAN DEFAULT true,
  steps        JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
-- steps format: [{ delay_hours: 24, message: "Follow-up text..." }, ...]

CREATE TABLE IF NOT EXISTS public.contact_sequences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id  UUID NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  next_send_at TIMESTAMPTZ,
  status       VARCHAR(20) DEFAULT 'active',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_sequences_next ON public.contact_sequences(next_send_at, status);
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_sequences   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seq_workspace" ON public.follow_up_sequences;
CREATE POLICY "seq_workspace" ON public.follow_up_sequences FOR ALL
  USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "contact_seq_workspace" ON public.contact_sequences;
CREATE POLICY "contact_seq_workspace" ON public.contact_sequences FOR ALL
  USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
COMMIT;

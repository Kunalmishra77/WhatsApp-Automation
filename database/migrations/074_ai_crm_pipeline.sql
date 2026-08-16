-- 074_ai_crm_pipeline.sql — AI CRM pipeline automation
-- Adds AI stage-classification provenance to leads + a stage-change audit trail.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage_source VARCHAR(10) NOT NULL DEFAULT 'manual'
    CHECK (stage_source IN ('ai','manual')),
  ADD COLUMN IF NOT EXISTS stage_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_stage_confidence INTEGER
    CHECK (ai_stage_confidence IS NULL OR (ai_stage_confidence BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS ai_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_follow_up BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_reason TEXT,
  ADD COLUMN IF NOT EXISTS converted_signal TEXT,
  ADD COLUMN IF NOT EXISTS conversion_reviewed BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage lead_stage,
  to_stage lead_stage NOT NULL,
  source VARCHAR(10) NOT NULL CHECK (source IN ('ai','manual')),
  reason TEXT,
  confidence INTEGER,
  actor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead
  ON public.lead_stage_history(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_needs_follow_up
  ON public.leads(workspace_id) WHERE needs_follow_up = true;
CREATE INDEX IF NOT EXISTS idx_leads_ai_classified_at
  ON public.leads(workspace_id, ai_classified_at NULLS FIRST);

ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;

-- Mirror the workspace-isolation pattern from 049_assignment_isolation_rls.sql.
-- Reads for members of the workspace; writes come via the admin client (RLS-bypassing).
DROP POLICY IF EXISTS lead_stage_history_workspace_isolation ON public.lead_stage_history;
CREATE POLICY lead_stage_history_workspace_isolation ON public.lead_stage_history
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

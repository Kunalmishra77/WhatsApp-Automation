-- 071_native_flows.sql — native Meta WhatsApp Flows (non-endpoint) MVP.
CREATE TABLE IF NOT EXISTS public.flows_meta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_key  text NOT NULL,
  meta_flow_id  text,
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'draft',   -- draft | published | deprecated
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, template_key)
);
CREATE INDEX IF NOT EXISTS idx_flows_meta_ws ON public.flows_meta (workspace_id);

CREATE TABLE IF NOT EXISTS public.flow_sessions_native (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id      uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  flow_token      text NOT NULL UNIQUE,
  template_key    text NOT NULL,
  meta_flow_id    text,
  status          text NOT NULL DEFAULT 'sent',    -- sent | completed
  response        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_native_token ON public.flow_sessions_native (flow_token);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_native_ws ON public.flow_sessions_native (workspace_id);

ALTER TABLE public.flows_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_sessions_native ENABLE ROW LEVEL SECURITY;
-- Service-role admin client is used by all routes; deny direct client access.
DROP POLICY IF EXISTS flows_meta_no_client ON public.flows_meta;
CREATE POLICY flows_meta_no_client ON public.flows_meta FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS flow_sessions_native_no_client ON public.flow_sessions_native;
CREATE POLICY flow_sessions_native_no_client ON public.flow_sessions_native FOR ALL USING (false) WITH CHECK (false);

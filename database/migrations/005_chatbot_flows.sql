-- 005_chatbot_flows.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.chatbot_flows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  is_active     BOOLEAN DEFAULT false,
  trigger_type  VARCHAR(50) DEFAULT 'keyword',
  trigger_value TEXT,
  nodes         JSONB DEFAULT '[]',
  edges         JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.flow_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         UUID NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  current_node_id VARCHAR(255),
  status          VARCHAR(20) DEFAULT 'active',
  context         JSONB DEFAULT '{}',
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_flows_workspace ON public.chatbot_flows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flows_active    ON public.chatbot_flows(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_conv      ON public.flow_sessions(conversation_id, status);

ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_sessions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chatbot_flows_workspace" ON public.chatbot_flows;
CREATE POLICY "chatbot_flows_workspace" ON public.chatbot_flows
  FOR ALL USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "flow_sessions_workspace" ON public.flow_sessions;
CREATE POLICY "flow_sessions_workspace" ON public.flow_sessions
  FOR ALL USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;

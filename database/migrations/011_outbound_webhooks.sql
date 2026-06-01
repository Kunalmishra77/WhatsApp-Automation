BEGIN;

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  url          TEXT NOT NULL,
  secret       VARCHAR(255),
  events       TEXT[] DEFAULT '{}',
  -- events: message.received | conversation.created | conversation.resolved |
  --         contact.created | campaign.completed
  is_active    BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  failure_count     INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id     UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event           VARCHAR(100) NOT NULL,
  payload         JSONB,
  status_code     INTEGER,
  success         BOOLEAN DEFAULT false,
  error_message   TEXT,
  delivered_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wh_endpoints_ws  ON public.webhook_endpoints(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wh_deliveries_ep ON public.webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_wh_deliveries_ws ON public.webhook_deliveries(workspace_id, delivered_at DESC);

ALTER TABLE public.webhook_endpoints  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wh_endpoints_ws"  ON public.webhook_endpoints;
CREATE POLICY "wh_endpoints_ws" ON public.webhook_endpoints FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "wh_deliveries_ws" ON public.webhook_deliveries;
CREATE POLICY "wh_deliveries_ws" ON public.webhook_deliveries FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;

-- Tenant Health Watchdog: per-tenant silent-detection state + snapshot RPC + daily cron.

-- ── State table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspace_health (
  workspace_id    UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'ok',   -- 'ok' | 'silent'
  last_inbound_at TIMESTAMPTZ,
  silent_since    TIMESTAMPTZ,
  probe           JSONB DEFAULT '{}',
  notified_at     TIMESTAMPTZ,
  recovered_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_health_no_client ON public.workspace_health;
CREATE POLICY workspace_health_no_client ON public.workspace_health FOR ALL USING (false) WITH CHECK (false);

-- ── Snapshot RPC ──────────────────────────────────────────────────────────────
-- Per active workspace: last inbound, baseline-window count, recent-window count,
-- plus creds for the Meta probe. SECURITY DEFINER; returns access_token so it is
-- REVOKEd from all client roles (service-role/admin client only).
CREATE OR REPLACE FUNCTION public.get_tenant_health_snapshot()
RETURNS TABLE (
  workspace_id    uuid,
  name            text,
  phone_number_id text,
  access_token    text,
  is_active       boolean,
  last_inbound_at timestamptz,
  baseline_count  int,
  recent_count    int
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.name, w.phone_number_id, w.access_token,
         COALESCE(w.is_active, true),
         li.last_inbound_at,
         COALESCE(bl.c, 0)::int,
         COALESCE(rc.c, 0)::int
  FROM public.workspaces w
  LEFT JOIN LATERAL (
    SELECT max(m.created_at) AS last_inbound_at
    FROM public.messages m
    JOIN public.conversations cv ON cv.id = m.conversation_id
    WHERE cv.workspace_id = w.id AND m.direction = 'inbound'
  ) li ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS c
    FROM public.messages m
    JOIN public.conversations cv ON cv.id = m.conversation_id
    WHERE cv.workspace_id = w.id AND m.direction = 'inbound'
      AND m.created_at >= now() - interval '16 days'
      AND m.created_at <  now() - interval '2 days'
  ) bl ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS c
    FROM public.messages m
    JOIN public.conversations cv ON cv.id = m.conversation_id
    WHERE cv.workspace_id = w.id AND m.direction = 'inbound'
      AND m.created_at >= now() - interval '48 hours'
  ) rc ON true
  WHERE COALESCE(w.is_active, true) = true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_health_snapshot() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_health_snapshot() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_health_snapshot() FROM authenticated;

-- ── Daily cron ────────────────────────────────────────────────────────────────
-- NOTE: uses app.base_url / app.cron_secret. Those settings require the postgres
-- superuser (not settable from the pooler). If unavailable, inline the URL +
-- CRON_SECRET literally in the command below (this is what the live job does).
SELECT cron.unschedule('tenant-health-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'tenant-health-check'
);

SELECT cron.schedule(
  'tenant-health-check',
  '30 4 * * *',   -- 04:30 UTC daily (~10:00 IST)
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/tenant-health',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

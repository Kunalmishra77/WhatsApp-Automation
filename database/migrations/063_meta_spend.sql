-- Meta Spend & Billing: real per-day per-category spend from Meta pricing_analytics.
-- FINANCIAL DATA — must NOT be deleted by campaign-retention cleanup.

CREATE TABLE IF NOT EXISTS public.meta_spend_daily (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  waba_id      TEXT,
  day          DATE NOT NULL,
  category     TEXT NOT NULL,
  volume       INTEGER NOT NULL DEFAULT 0,
  cost         NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency     TEXT,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, day, category)
);
CREATE INDEX IF NOT EXISTS idx_meta_spend_daily_ws_day ON public.meta_spend_daily (workspace_id, day);

CREATE TABLE IF NOT EXISTS public.meta_spend_sync (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  range_start  DATE,
  range_end    DATE,
  rows_upserted INTEGER DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'ok',
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_spend_sync_ws ON public.meta_spend_sync (workspace_id, created_at DESC);

ALTER TABLE public.meta_spend_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_spend_sync  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_spend_daily_no_client ON public.meta_spend_daily;
CREATE POLICY meta_spend_daily_no_client ON public.meta_spend_daily FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS meta_spend_sync_no_client ON public.meta_spend_sync;
CREATE POLICY meta_spend_sync_no_client ON public.meta_spend_sync FOR ALL USING (false) WITH CHECK (false);

-- Daily sync cron. NOTE: uses app.base_url / app.cron_secret if set; otherwise the controller
-- inlines the URL + CRON_SECRET literally (as with the reply-sweep / sla jobs).
SELECT cron.unschedule('meta-spend-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'meta-spend-sync'
);
SELECT cron.schedule(
  'meta-spend-sync',
  '0 5 * * *',   -- 05:00 UTC daily
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/meta-spend-sync',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ── 075_reclassify_cron.sql ─────────────────────────────────────────────────
-- Lead reclassification backstop. Every 15 minutes, POST /api/cron/reclassify-
-- leads, which re-runs the AI lead-pipeline classifier over leads whose
-- classification is missing or stale relative to their conversation's latest
-- message (up to 100 per run) — covering any lead the inbound-path classify
-- call skipped or failed on. Mirrors 057_reply_sweep_cron.sql; uses the same
-- app.base_url / app.cron_secret database settings. No lock table needed:
-- classifyLeadPipeline()'s writes are idempotent, so overlapping runs are safe.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Schedule: every 15 minutes ───────────────────────────────────────────────
-- NOTE: this uses the app.base_url / app.cron_secret database settings. Setting
-- them requires the postgres superuser (ALTER DATABASE ... SET) and can only be
-- done from the Supabase SQL editor, NOT from the pooler service role:
--     ALTER DATABASE postgres SET app.base_url   = 'https://app.aiagentixdev.com';
--     ALTER DATABASE postgres SET app.cron_secret = '<CRON_SECRET>';
-- (This also fixes the pre-existing sla-breach-check job, which shares them.)
-- If those settings cannot be applied, inline the URL + CRON_SECRET literally in
-- the command below instead of current_setting() — which is what the live job
-- currently does, since the settings were never configured.
SELECT cron.unschedule('reclassify-leads') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reclassify-leads'
);

SELECT cron.schedule(
  'reclassify-leads',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/reclassify-leads',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

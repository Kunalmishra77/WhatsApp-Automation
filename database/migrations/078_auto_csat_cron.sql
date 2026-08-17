-- ── 078_auto_csat_cron.sql ───────────────────────────────────────────────────
-- Auto-CSAT sweep. Every 30 minutes, POST /api/cron/auto-csat which asks
-- customers to rate a conversation once it has naturally wound down (in-window
-- only, capped at 30 sends/run — see lib/auto-csat.ts). Mirrors the
-- missed-reply-sweep job (057); uses the same app.base_url / app.cron_secret
-- database settings. All eligibility logic lives in application code
-- (lib/auto-csat.ts) — no new tables/functions are needed here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Schedule: every 30 minutes ───────────────────────────────────────────────
-- NOTE: this uses the app.base_url / app.cron_secret database settings. Setting
-- them requires the postgres superuser (ALTER DATABASE ... SET) and can only be
-- done from the Supabase SQL editor, NOT from the pooler service role:
--     ALTER DATABASE postgres SET app.base_url   = 'https://app.aiagentixdev.com';
--     ALTER DATABASE postgres SET app.cron_secret = '<CRON_SECRET>';
-- If those settings cannot be applied, inline the URL + CRON_SECRET literally in
-- the command below instead of current_setting() — same fallback used by 057.
SELECT cron.unschedule('auto-csat') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-csat'
);

SELECT cron.schedule(
  'auto-csat',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/auto-csat',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

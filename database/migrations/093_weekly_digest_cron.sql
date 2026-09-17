-- 093_weekly_digest_cron.sql
-- Schedule the weekly performance digest email — Mondays 04:00 UTC (~09:30 IST).
-- Mirrors the other cron jobs (uses app.base_url / app.cron_secret if set).

SELECT cron.unschedule('weekly-digest') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-digest'
);
SELECT cron.schedule(
  'weekly-digest',
  '0 4 * * 1',   -- Monday 04:00 UTC
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/weekly-digest',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

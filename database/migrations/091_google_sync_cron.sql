-- 091_google_sync_cron.sql
-- Phase 2/4 polish: schedule the GBP + Google Ads sync every 6 hours.
-- Mirrors the meta-spend-sync job (migration 063): uses app.base_url /
-- app.cron_secret if set, else the controller inlines URL + CRON_SECRET.

SELECT cron.unschedule('google-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'google-sync'
);
SELECT cron.schedule(
  'google-sync',
  '15 */6 * * *',   -- every 6 hours at :15
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/google-sync',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

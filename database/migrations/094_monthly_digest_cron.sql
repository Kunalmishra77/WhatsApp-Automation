-- 094_monthly_digest_cron.sql
-- Schedule the monthly performance digest — 1st of each month, 05:00 UTC.

SELECT cron.unschedule('monthly-digest') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'monthly-digest'
);
SELECT cron.schedule(
  'monthly-digest',
  '0 5 1 * *',   -- 1st of month, 05:00 UTC
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/monthly-digest',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

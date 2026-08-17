-- 081_backfill_sentiment_cron.sql
-- Backfill sentiment for old/outage-window conversations that never got it (the bot
-- only computes sentiment live on inbound). Runs every 20 min, drains the backlog on
-- the funded provider keys, then idles (new conversations keep getting sentiment live).
-- Mirrors 057_reply_sweep_cron; inline the URL + CRON_SECRET at apply time.
SELECT cron.unschedule('backfill-sentiment')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backfill-sentiment');
SELECT cron.schedule('backfill-sentiment', '*/20 * * * *', $$
  SELECT net.http_post(
    url     := current_setting('app.base_url', true) || '/api/cron/backfill-sentiment',
    headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
$$);

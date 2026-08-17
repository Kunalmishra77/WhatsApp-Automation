-- 079_auto_assign_cron.sql
-- Auto-assignment: every 10 minutes, distribute unassigned open conversations (and
-- their linked lead) to the least-busy team member, per workspace. Only workspaces
-- with assignable agents (admin/manager/agent) are affected — solo super_admin
-- workspaces have no team and are skipped by the route. Mirrors 057_reply_sweep_cron.
-- (Uses app.base_url / app.cron_secret; if unset via the pooler, inline the literal
-- URL + CRON_SECRET at apply time — same as the other cron jobs here.)
SELECT cron.unschedule('auto-assign')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-assign');

SELECT cron.schedule('auto-assign', '*/10 * * * *', $$
  SELECT net.http_post(
    url     := current_setting('app.base_url', true) || '/api/cron/auto-assign',
    headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
$$);

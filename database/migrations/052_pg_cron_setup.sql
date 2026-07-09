-- ── 052_pg_cron_setup.sql ─────────────────────────────────────────────────────
-- Enables pg_cron (requires Supabase Pro plan) and sets up scheduled jobs for:
--   1. SLA breach detection (every 15 minutes)
--   2. Stale flow-session cleanup (every 2 hours)
--
-- Run this in the Supabase SQL editor ONCE after enabling pg_cron.
-- Dashboard → Project Settings → Extensions → enable "pg_cron"
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable the extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage so the cron scheduler can call functions in the public schema
GRANT USAGE ON SCHEMA cron TO postgres;

-- ── 1. SLA Breach Detection ───────────────────────────────────────────────────
-- Calls the existing /api/cron/check-sla-breaches endpoint via http_post.
-- Runs every 15 minutes. Requires pg_net extension (enabled on Supabase Pro).
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing version of this job
SELECT cron.unschedule('sla-breach-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sla-breach-check'
);

SELECT cron.schedule(
  'sla-breach-check',
  '*/15 * * * *',   -- every 15 minutes
  $$
    SELECT net.http_post(
      url       := current_setting('app.base_url', true) || '/api/cron/check-sla-breaches',
      headers   := '{"Authorization": "Bearer ' || current_setting('app.cron_secret', true) || '", "Content-Type": "application/json"}'::jsonb,
      body      := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ── 2. Stale Flow-Session Cleanup ─────────────────────────────────────────────
-- Flow sessions (flow_sessions table) can get stuck if a user abandons mid-flow.
-- Clear sessions that have had no activity for > 24 hours.
CREATE OR REPLACE FUNCTION cleanup_stale_flow_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM flow_sessions
  WHERE updated_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- Remove any existing version of this job
SELECT cron.unschedule('stale-flow-session-cleanup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'stale-flow-session-cleanup'
);

SELECT cron.schedule(
  'stale-flow-session-cleanup',
  '0 */2 * * *',   -- every 2 hours at the top of the hour
  'SELECT cleanup_stale_flow_sessions()'
);

-- ── 3. (Optional) Data Retention Check ───────────────────────────────────────
-- Notifies workspace owners when data is older than their retention_months setting.
-- Only creates a notification row; actual deletion is manual via the UI.
-- Runs daily at 03:00 UTC.
CREATE OR REPLACE FUNCTION check_retention_due()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws RECORD;
  months INT;
  cutoff TIMESTAMPTZ;
  old_count BIGINT;
BEGIN
  FOR ws IN
    SELECT id, name, settings
    FROM workspaces
    WHERE settings IS NOT NULL
  LOOP
    months := COALESCE((ws.settings->>'retention_months')::int, 2);
    cutoff  := NOW() - (months || ' months')::interval;

    SELECT COUNT(*) INTO old_count
    FROM conversations
    WHERE workspace_id = ws.id
      AND last_message_at < cutoff;

    -- Only notify if there are old conversations and no recent notification exists
    IF old_count > 0 THEN
      INSERT INTO notifications (workspace_id, user_id, type, title, body, data, created_at)
      SELECT
        ws.id,
        wm.user_id,
        'retention_due',
        'Data Retention: Archive Available',
        old_count || ' conversations older than ' || months || ' months are ready to archive.',
        jsonb_build_object('conversation_count', old_count, 'months', months),
        NOW()
      FROM workspace_members wm
      WHERE wm.workspace_id = ws.id
        AND wm.role IN ('super_admin', 'admin')
        -- Skip if a retention_due notification was sent in the last 7 days
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.workspace_id = ws.id
            AND n.user_id = wm.user_id
            AND n.type = 'retention_due'
            AND n.created_at > NOW() - INTERVAL '7 days'
        )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Remove any existing version of this job
SELECT cron.unschedule('retention-due-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'retention-due-check'
);

SELECT cron.schedule(
  'retention-due-check',
  '0 3 * * *',   -- daily at 03:00 UTC
  'SELECT check_retention_due()'
);

-- ── Verify scheduled jobs ────────────────────────────────────────────────────
-- Run this to confirm jobs were created:
-- SELECT jobid, jobname, schedule, command FROM cron.job;
--
-- To set the base_url and cron_secret for job #1 (SLA breach via HTTP):
--   ALTER DATABASE postgres SET app.base_url = 'https://your-app.vercel.app';
--   ALTER DATABASE postgres SET app.cron_secret = 'your-cron-secret';

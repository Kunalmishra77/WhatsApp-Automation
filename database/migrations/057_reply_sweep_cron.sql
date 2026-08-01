-- ── 057_reply_sweep_cron.sql ─────────────────────────────────────────────────
-- Missed-reply watchdog. Every 3 minutes, POST /api/cron/reply-sweep which
-- answers any customer whose latest WhatsApp message went unanswered (all
-- workspaces). Mirrors the sla-breach-check job; uses the same app.base_url /
-- app.cron_secret database settings.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Query function: unanswered conversations needing a catch-up reply ────────
-- Keys on each conversation's TRUE latest message (distinct on, over the last
-- window_hours for perf), then keeps only those whose latest is an inbound that
-- is old enough (>= min_age), the conversation is open + bot-active, the contact
-- is not blocked/opted-out, the workspace has creds + a persona, no outbound has
-- landed since, and no flow session is active.
CREATE OR REPLACE FUNCTION public.get_unanswered_conversations(
  p_min_age_minutes int,
  p_window_hours int,
  p_limit int
)
RETURNS TABLE (
  conversation_id  uuid,
  workspace_id     uuid,
  contact_id       uuid,
  phone            text,
  name             text,
  last_content     text,
  last_at          timestamptz,
  phone_number_id  text,
  access_token     text,
  settings         jsonb,
  business_name    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id, m.content AS last_content, m.created_at AS last_at,
      m.direction, cv.contact_id, cv.workspace_id
    FROM messages m
    JOIN conversations cv ON cv.id = m.conversation_id
    WHERE m.created_at > now() - (p_window_hours || ' hours')::interval
    ORDER BY m.conversation_id, m.created_at DESC
  )
  SELECT l.conversation_id, l.workspace_id, l.contact_id, ct.phone, ct.name,
         l.last_content, l.last_at, w.phone_number_id, w.access_token, w.settings, w.name
  FROM latest l
  JOIN conversations cv ON cv.id = l.conversation_id
  JOIN contacts ct      ON ct.id = l.contact_id
  JOIN workspaces w     ON w.id  = l.workspace_id
  WHERE l.direction = 'inbound'
    AND l.last_at <= now() - (p_min_age_minutes || ' minutes')::interval
    AND cv.status = 'open'
    AND COALESCE(cv.bot_paused, false) = false
    AND COALESCE(ct.is_blocked, false) = false
    AND COALESCE(ct.opted_out, false) = false
    AND w.phone_number_id IS NOT NULL
    AND w.access_token IS NOT NULL
    AND COALESCE(w.settings->>'agent_persona', '') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM messages o
      WHERE o.conversation_id = l.conversation_id AND o.direction = 'outbound' AND o.created_at >= l.last_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM flow_sessions fs
      WHERE fs.conversation_id = l.conversation_id AND fs.status = 'active'
    )
  ORDER BY l.last_at ASC
  LIMIT p_limit;
$$;

-- SECURITY: the function is SECURITY DEFINER and returns every workspace's
-- WhatsApp access_token + customer messages. Postgres grants EXECUTE to PUBLIC
-- by default — revoke it so ONLY the service-role admin client (used by the cron
-- route) can call it. Never expose this to anon/authenticated (browser) clients.
REVOKE EXECUTE ON FUNCTION public.get_unanswered_conversations(int, int, int) FROM PUBLIC, anon, authenticated;

-- ── Single-flight lock ───────────────────────────────────────────────────────
-- A one-row lease so two overlapping sweep invocations can never both reply to
-- the same conversation. The endpoint claims it with an atomic conditional
-- UPDATE and releases it when done; a crashed run's lease self-expires.
CREATE TABLE IF NOT EXISTS public.reply_sweep_lock (
  id            int PRIMARY KEY DEFAULT 1,
  locked_until  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.reply_sweep_lock (id, locked_until) VALUES (1, now()) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.reply_sweep_lock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reply_sweep_lock_no_client ON public.reply_sweep_lock;
CREATE POLICY reply_sweep_lock_no_client ON public.reply_sweep_lock FOR ALL USING (false) WITH CHECK (false);

-- ── Schedule: every 3 minutes ────────────────────────────────────────────────
-- NOTE: this uses the app.base_url / app.cron_secret database settings. Setting
-- them requires the postgres superuser (ALTER DATABASE ... SET) and can only be
-- done from the Supabase SQL editor, NOT from the pooler service role:
--     ALTER DATABASE postgres SET app.base_url   = 'https://app.aiagentixdev.com';
--     ALTER DATABASE postgres SET app.cron_secret = '<CRON_SECRET>';
-- (This also fixes the pre-existing sla-breach-check job, which shares them.)
-- If those settings cannot be applied, inline the URL + CRON_SECRET literally in
-- the command below instead of current_setting() — which is what the live job
-- currently does, since the settings were never configured.
SELECT cron.unschedule('missed-reply-sweep') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'missed-reply-sweep'
);

SELECT cron.schedule(
  'missed-reply-sweep',
  '*/3 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/reply-sweep',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

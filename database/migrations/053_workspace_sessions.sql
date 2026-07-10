-- 053_workspace_sessions.sql
-- Application-level session tracker for super_admin/admin role limiting.
-- Supabase JWT handles identity; this table handles "how many browsers are allowed."
-- RLS is set to USING (false) — only the server-side admin client (service-role key) reads/writes this table.

CREATE TABLE IF NOT EXISTS public.workspace_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  session_token VARCHAR(64) NOT NULL UNIQUE,
  user_agent    TEXT,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ws_sessions_workspace_user
  ON public.workspace_sessions (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_ws_sessions_token
  ON public.workspace_sessions (session_token);

CREATE INDEX IF NOT EXISTS idx_ws_sessions_expires
  ON public.workspace_sessions (expires_at);

ALTER TABLE public.workspace_sessions ENABLE ROW LEVEL SECURITY;

-- Block all direct client access — only service-role (admin) client may access this table.
CREATE POLICY "sessions_deny_all_client_access"
  ON public.workspace_sessions
  FOR ALL
  USING (false);

-- pg_cron: clean up expired sessions every hour.
-- Requires pg_cron extension already enabled (migration 052).
SELECT cron.unschedule('cleanup-expired-sessions')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-sessions');

SELECT cron.schedule(
  'cleanup-expired-sessions',
  '0 * * * *',
  'DELETE FROM public.workspace_sessions WHERE expires_at < NOW()'
);

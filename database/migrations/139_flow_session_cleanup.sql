-- 139 — A cleanup job was deleting the sessions that were waiting on purpose.
--
-- `cleanup_stale_flow_sessions` (migration 052) ran every two hours and did
-- this:
--
--   DELETE FROM flow_sessions WHERE updated_at < NOW() - INTERVAL '24 hours';
--
-- A session parked on a Wait, or on a question's timeoutHours, stops touching
-- `updated_at` for exactly as long as it is meant to be waiting. So every
-- wake-up further out than 24 hours arrived to find its session deleted, and
-- `resumeFlowSession` does `if (!session) return false` — silently, because a
-- missing session is indistinguishable from one the customer already answered.
--
-- This is live and measurable. Every question and collect step in Fitness
-- First's and VMS's active flows carries `timeoutHours: 48`:
--
--   Fitness First  FitStar Challenge 2026 — Join Now   4 steps at 48h
--   Fitness First  Welcome Message                      4 steps at 48h
--   VMS            Demo Booking Flow                    7 steps at 48h
--
-- Not one of those "if they don't reply in 48 hours" branches can ever have
-- fired. The engine was taught to read `timeoutHours` and schedule the wake-up;
-- this job was deleting the session 24 hours before it came due. The Wait node
-- and the Template node — which exists precisely so a follow-up can land days
-- later, outside WhatsApp's 24-hour window — were built on the same sand.
--
-- Three changes, each for its own reason:
--
--  1. A session with a wake-up pending is never touched. The timer is what will
--     advance or expire it, and "has not been updated recently" is the normal
--     state of a session that is waiting correctly. This guard, not the window,
--     is what makes long waits safe — a 7-day follow-up is as protected as a
--     48-hour one.
--
--  2. Stale means 48 hours, not 24, and the session is marked `expired` rather
--     than deleted. 48 hours is the number /api/cron/cleanup-flow-sessions
--     already used for the same job; the engine looks for `status = 'active'`,
--     so expiring unblocks the contact exactly as deleting did.
--
--  3. Finished sessions are kept for 90 days. They were deleted within 24
--     hours of ending, which is why `flow_sessions` is empty right now and why
--     nothing on this platform can answer "how many people finished this flow
--     last month" or "where do they drop out". Per-node drop-off analytics
--     needs this history to exist before it can read it.
--
-- Returns counts so the HTTP route can report what it did instead of guessing.

-- DROP first: migration 052's version returns void, and `CREATE OR REPLACE`
-- cannot change a function's return type — it fails with "cannot change return
-- type of existing function", which is how this migration failed on its first
-- run. Returning counts is the point, so the signature has to change; the
-- pg_cron job below holds its command as text, so dropping the function does
-- not disturb it.
DROP FUNCTION IF EXISTS public.cleanup_stale_flow_sessions();

CREATE FUNCTION public.cleanup_stale_flow_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired int;
  v_purged  int;
BEGIN
  WITH stuck AS (
    SELECT s.id
    FROM public.flow_sessions s
    WHERE s.status = 'active'
      AND s.updated_at < now() - INTERVAL '48 hours'
      -- A session waiting on a timer is not stuck. This is the whole fix.
      AND NOT EXISTS (
        SELECT 1 FROM public.time_trigger_queue q
        WHERE q.action_type = 'flow_resume'
          AND q.status = 'pending'
          AND q.action_data->>'session_id' = s.id::text
      )
  )
  UPDATE public.flow_sessions s
  SET status = 'expired', updated_at = now()
  FROM stuck
  WHERE s.id = stuck.id;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  -- Retention, not cleanup: a finished session is the only record that someone
  -- went through this flow at all.
  DELETE FROM public.flow_sessions
  WHERE status <> 'active'
    AND updated_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_purged = ROW_COUNT;

  RETURN jsonb_build_object('expired', v_expired, 'purged', v_purged);
END;
$$;

-- The job itself is unchanged in shape; `PERFORM` because the function now
-- returns a value.
SELECT cron.unschedule('stale-flow-session-cleanup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'stale-flow-session-cleanup'
);

SELECT cron.schedule(
  'stale-flow-session-cleanup',
  '0 */2 * * *',
  $$ SELECT public.cleanup_stale_flow_sessions() $$
);

-- Service-role only, as every other SECURITY DEFINER function here is: it
-- rewrites session state across every workspace.
REVOKE ALL ON FUNCTION public.cleanup_stale_flow_sessions() FROM public, anon, authenticated;

-- An index for the guard's NOT EXISTS. Without it, each stale session costs a
-- scan of the queue — small today, and this runs every two hours forever.
CREATE INDEX IF NOT EXISTS idx_ttq_flow_resume_session
  ON public.time_trigger_queue ((action_data->>'session_id'))
  WHERE action_type = 'flow_resume';

-- Lets the retention sweep and the drop-off reports find rows by age without
-- reading the whole table.
CREATE INDEX IF NOT EXISTS idx_flow_sessions_status_updated
  ON public.flow_sessions (status, updated_at);

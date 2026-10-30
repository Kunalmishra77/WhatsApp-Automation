-- 140 — Where customers leave a flow.
--
-- `current_node_id` says where a session is now. It cannot answer "how many
-- people reached step 4", which is the only question that makes a drop-off
-- report useful — a step nobody reaches is not a step people abandon.
--
-- So the path is recorded. Not by the application: the engine already writes
-- the session row on every advance, and a trigger can append to the path inside
-- that same statement. No extra round trip on the inbound path, and no lost
-- append when two messages race, which a read-modify-write in the app would
-- have. `flow_sessions` is not in the `supabase_realtime` publication and has
-- default replica identity, so a growing array costs nothing in WAL decoding —
-- the thing that made the same idea unaffordable on `messages`.
--
-- This only works because migration 139 stopped deleting sessions within a day
-- of their ending. Before it there was no history to count.

ALTER TABLE public.flow_sessions
  ADD COLUMN IF NOT EXISTS visited_nodes text[] NOT NULL DEFAULT '{}';

-- A flow may legitimately loop — a menu the customer returns to — so the path
-- is capped rather than assumed finite. 200 steps is far past any real flow
-- (the longest live one is 14 nodes) and keeps a runaway session from growing
-- the row without bound. The cap trims the OLDEST entries, because the recent
-- ones are what says where someone stopped.
CREATE OR REPLACE FUNCTION public.flow_session_track_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_path text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.visited_nodes := CASE
      WHEN NEW.current_node_id IS NULL THEN '{}'::text[]
      ELSE ARRAY[NEW.current_node_id]
    END;
    RETURN NEW;
  END IF;

  -- Only an actual move counts. Every other update to the row — a status
  -- change, a context write — leaves the path alone, so "stopped here" means
  -- the step they were on, not the last time anything touched the session.
  IF NEW.current_node_id IS DISTINCT FROM OLD.current_node_id
     AND NEW.current_node_id IS NOT NULL THEN
    v_path := COALESCE(OLD.visited_nodes, '{}'::text[]) || NEW.current_node_id;
    IF array_length(v_path, 1) > 200 THEN
      v_path := v_path[(array_length(v_path, 1) - 199):];
    END IF;
    NEW.visited_nodes := v_path;
  ELSE
    NEW.visited_nodes := COALESCE(OLD.visited_nodes, '{}'::text[]);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flow_session_track_path ON public.flow_sessions;
CREATE TRIGGER trg_flow_session_track_path
  BEFORE INSERT OR UPDATE ON public.flow_sessions
  FOR EACH ROW EXECUTE FUNCTION public.flow_session_track_path();

-- Backfill: every existing session has been somewhere, even if only one step.
UPDATE public.flow_sessions
SET visited_nodes = ARRAY[current_node_id]
WHERE current_node_id IS NOT NULL
  AND (visited_nodes IS NULL OR array_length(visited_nodes, 1) IS NULL);

-- ── The report ───────────────────────────────────────────────────────────────
--
-- Per step: how many sessions got there, and how many got no further. The
-- second is the whole point — a step with 90 arrivals and 80 stops is where the
-- flow is losing people, and it is invisible in any count of completions.
--
-- `stopped` is read from the LAST entry of the path rather than from
-- `current_node_id`, so it survives a session being expired or purged in a way
-- that rewrites the row.
--
-- Takes p_workspace as well as p_flow and requires both to match, the same
-- defence-in-depth the data-integrity audit applied to every other scoped
-- read: a SECURITY DEFINER function that trusted an id alone would hand one
-- workspace another's numbers to anyone who guessed a uuid.
CREATE OR REPLACE FUNCTION public.flow_dropoff(
  p_workspace uuid, p_flow uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(node_id text, reached bigint, stopped bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT visited_nodes
    FROM public.flow_sessions
    WHERE workspace_id = p_workspace
      AND flow_id = p_flow
      AND started_at >= p_from AND started_at < p_to
      AND array_length(visited_nodes, 1) > 0
  )
  SELECT n.node_id,
         count(*)::bigint AS reached,
         count(*) FILTER (
           WHERE s.visited_nodes[array_length(s.visited_nodes, 1)] = n.node_id
         )::bigint AS stopped
  FROM s, LATERAL (
    -- DISTINCT: a loop that returns to a step twice is one person reaching it,
    -- not two.
    SELECT DISTINCT unnest(s.visited_nodes) AS node_id
  ) n
  GROUP BY n.node_id;
$$;

-- How many sessions this flow ran, and how many ended somewhere that counts as
-- finished. Separate from the per-step numbers because a report needs a
-- denominator, and `reached` for the start node is not it once a flow has a
-- Jump that can re-enter.
CREATE OR REPLACE FUNCTION public.flow_session_totals(
  p_workspace uuid, p_flow uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(sessions bigint, active bigint, expired bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE status = 'active')::bigint,
         count(*) FILTER (WHERE status = 'expired')::bigint
  FROM public.flow_sessions
  WHERE workspace_id = p_workspace
    AND flow_id = p_flow
    AND started_at >= p_from AND started_at < p_to;
$$;

REVOKE ALL ON FUNCTION public.flow_dropoff(uuid, uuid, timestamptz, timestamptz)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.flow_session_totals(uuid, uuid, timestamptz, timestamptz)
  FROM public, anon, authenticated;

-- Both reports filter on exactly these three.
CREATE INDEX IF NOT EXISTS idx_flow_sessions_ws_flow_started
  ON public.flow_sessions (workspace_id, flow_id, started_at DESC);

-- 141 — Every saved version of a flow, and a way back to one.
--
-- Non-technical people edit live flows. A client deleting the wrong branch at
-- 11pm has, until now, had no way back and no way to see what changed — and
-- this repository contains nine migrations that reached into `chatbot_flows`
-- and rewrote nodes directly, which is riskier still because nobody was
-- watching when they ran.
--
-- The snapshot is taken by a trigger rather than by the save route, for exactly
-- that reason: a version written by the application would miss every change
-- made by SQL, which is the half of the history most worth having.
--
-- Each row is a state that WAS saved, stamped with when. So the newest version
-- always equals the flow as it stands, which makes the list readable — "Saved
-- 2:14pm, restore this" — rather than asking someone to reason about which
-- snapshot preceded which edit.

CREATE TABLE IF NOT EXISTS public.flow_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id       uuid NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          text,
  trigger_type  text,
  trigger_value text,
  nodes         jsonb NOT NULL DEFAULT '[]',
  edges         jsonb NOT NULL DEFAULT '[]',
  -- 'app' when a save route attributed it, 'sql' when nothing did — which is
  -- how a migration's rewrite is told apart from a client's edit.
  source        text NOT NULL DEFAULT 'sql',
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Every read of this table is "this flow, newest first".
CREATE INDEX IF NOT EXISTS idx_flow_versions_flow_created
  ON public.flow_versions (flow_id, created_at DESC);

ALTER TABLE public.flow_versions ENABLE ROW LEVEL SECURITY;
-- No policy on purpose: the routes read it with the admin client after checking
-- the caller's permission on the workspace, the same as chatbot_flows itself.
-- An RLS-enabled table with no policy denies everything, which is the safe
-- default for history that includes other workspaces' flows.

-- ── The snapshot ─────────────────────────────────────────────────────────────
--
-- Capped at 50 per flow. A flow is saved by a person clicking Save, not by
-- traffic, so 50 is months of editing — and the cap is what stops a table of
-- history from outgrowing the thing it is history of.
CREATE OR REPLACE FUNCTION public.flow_snapshot_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only a change worth going back to. A flow toggled active, or whose
  -- updated_at moved, is not a new version: a history of no-ops is a history
  -- nobody reads.
  IF TG_OP = 'UPDATE'
     AND NEW.nodes IS NOT DISTINCT FROM OLD.nodes
     AND NEW.edges IS NOT DISTINCT FROM OLD.edges
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.trigger_type IS NOT DISTINCT FROM OLD.trigger_type
     AND NEW.trigger_value IS NOT DISTINCT FROM OLD.trigger_value THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.flow_versions
    (flow_id, workspace_id, name, trigger_type, trigger_value, nodes, edges)
  VALUES
    (NEW.id, NEW.workspace_id, NEW.name, NEW.trigger_type, NEW.trigger_value,
     COALESCE(NEW.nodes, '[]'::jsonb), COALESCE(NEW.edges, '[]'::jsonb));

  DELETE FROM public.flow_versions v
  WHERE v.flow_id = NEW.id
    AND v.id NOT IN (
      SELECT id FROM public.flow_versions
      WHERE flow_id = NEW.id
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flow_snapshot_version ON public.chatbot_flows;
CREATE TRIGGER trg_flow_snapshot_version
  AFTER INSERT OR UPDATE ON public.chatbot_flows
  FOR EACH ROW EXECUTE FUNCTION public.flow_snapshot_version();

-- Seed: the current state of every existing flow becomes its first version, so
-- there is somewhere to go back to from the very next edit.
INSERT INTO public.flow_versions
  (flow_id, workspace_id, name, trigger_type, trigger_value, nodes, edges, created_at)
SELECT f.id, f.workspace_id, f.name, f.trigger_type, f.trigger_value,
       COALESCE(f.nodes, '[]'::jsonb), COALESCE(f.edges, '[]'::jsonb),
       COALESCE(f.updated_at, f.created_at, now())
FROM public.chatbot_flows f
WHERE NOT EXISTS (SELECT 1 FROM public.flow_versions v WHERE v.flow_id = f.id);

-- ── Attribution ──────────────────────────────────────────────────────────────
--
-- The trigger cannot know who clicked Save: the routes use the admin client, so
-- auth.uid() is null, and setting a GUC per request is not something this
-- deployment's connection pooler reliably allows (see the `app.base_url`
-- trouble in migration 059's notes). So the route stamps the version it just
-- caused, in its own call. A failure there leaves the version in place and
-- unattributed, which is the right way round — the history matters more than
-- the name on it.
CREATE OR REPLACE FUNCTION public.flow_version_attribute(
  p_flow uuid, p_workspace uuid, p_user uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.flow_versions v
  SET created_by = p_user, source = 'app'
  WHERE v.id = (
    SELECT id FROM public.flow_versions
    WHERE flow_id = p_flow AND workspace_id = p_workspace
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  );
$$;

-- ── Restore ──────────────────────────────────────────────────────────────────
--
-- Writes a version's nodes and edges back onto the flow. That write fires the
-- trigger above, so the state being replaced is itself kept — a restore is
-- undoable, which is the difference between a rollback and a second mistake.
--
-- `is_active` is deliberately not restored: whether a flow is live right now is
-- a decision about today, not a property of the version being brought back.
-- Restoring an old shape should not silently switch a flow on.
CREATE OR REPLACE FUNCTION public.flow_restore_version(
  p_workspace uuid, p_flow uuid, p_version uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record;
BEGIN
  SELECT * INTO v FROM public.flow_versions
  WHERE id = p_version AND flow_id = p_flow AND workspace_id = p_workspace;

  -- All three must line up. A function that trusted the version id alone would
  -- restore one workspace's flow into another's to anyone who guessed a uuid.
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.chatbot_flows
  SET nodes = v.nodes,
      edges = v.edges,
      name = COALESCE(v.name, name),
      trigger_type = v.trigger_type,
      trigger_value = v.trigger_value,
      updated_at = now()
  WHERE id = p_flow AND workspace_id = p_workspace;

  -- Sessions parked inside this flow are sitting on nodes that may not exist in
  -- the restored shape, or that now behave differently. Clearing them means
  -- those customers start cleanly on their next message rather than resuming
  -- into a step that changed under them — the same call migration 133 made by
  -- hand, now made every time.
  DELETE FROM public.flow_sessions
  WHERE flow_id = p_flow AND status = 'active';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.flow_version_attribute(uuid, uuid, uuid)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.flow_restore_version(uuid, uuid, uuid)
  FROM public, anon, authenticated;

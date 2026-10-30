-- 142 — The two columns richer triggers need, one of which the engine has been
-- reading all along.
--
-- `priority`: flow-engine.ts has sorted candidate flows by `flow.priority ?? 0`
-- since the day four Razorveda flows were found active at once. The column has
-- never existed, so every flow scores 0, the real order is oldest-first, and an
-- author has no way to say which of two matching flows should win. Found while
-- writing the trigger-conflict warning, whose advice had to be narrowed to
-- "change the trigger or turn the other one off" because raising a priority was
-- not something a client could do. Now it is.
--
-- `active_window`: which days and hours a flow may start on. This is what lets
-- an after-hours flow and a working-hours flow share one trigger instead of the
-- author maintaining two keywords for the same question. NULL means always,
-- which is what all nineteen existing flows mean.
--
-- Shape, matching lib/flow-triggers.ts:
--   {"days": [1,2,3,4,5], "from": "09:00", "to": "18:00"}
--   days: 0 = Sunday … 6 = Saturday; absent or empty = every day
--   from/to: "HH:MM" in IST, `from` inclusive and `to` exclusive, so two
--            windows meeting at 18:00 cover the day exactly once between them
--   from > to is an overnight window, and belongs to the day it starts on
--
-- No new trigger types are enumerated here. `trigger_type` is text and
-- `trigger_value` already carries the single parameter each type needs — a
-- keyword, a button id, an ad id, a campaign id — so the new types need no
-- schema change at all. What they needed was one place that agrees on what they
-- mean, which is lib/flow-triggers.ts.

ALTER TABLE public.chatbot_flows
  ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_window jsonb;

COMMENT ON COLUMN public.chatbot_flows.priority IS
  'Higher wins when two active flows match the same message. Ties break oldest-first. Read by flow-engine.ts and lib/flow-triggers.ts.';
COMMENT ON COLUMN public.chatbot_flows.active_window IS
  'When this flow may start: {"days":[0-6],"from":"HH:MM","to":"HH:MM"} in IST. NULL = always. from > to is overnight.';

-- The engine reads active flows for one workspace on every inbound message that
-- has no session, and now orders them by priority. `idx_conversations_*` has an
-- equivalent; `chatbot_flows` had nothing but the primary key.
CREATE INDEX IF NOT EXISTS idx_chatbot_flows_ws_active
  ON public.chatbot_flows (workspace_id, is_active, priority DESC, created_at);

-- The version-history trigger (migration 141) snapshots on a change to nodes,
-- edges, name or the trigger. Priority and the window are part of what a save
-- changed, so they belong in that comparison — otherwise "changed the hours"
-- would be recorded as "moved steps on the canvas".
CREATE OR REPLACE FUNCTION public.flow_snapshot_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.nodes IS NOT DISTINCT FROM OLD.nodes
     AND NEW.edges IS NOT DISTINCT FROM OLD.edges
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.trigger_type IS NOT DISTINCT FROM OLD.trigger_type
     AND NEW.trigger_value IS NOT DISTINCT FROM OLD.trigger_value
     AND NEW.priority IS NOT DISTINCT FROM OLD.priority
     AND NEW.active_window IS NOT DISTINCT FROM OLD.active_window THEN
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

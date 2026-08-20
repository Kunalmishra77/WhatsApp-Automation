-- 082_lost_cold_and_assignment_sync.sql
-- Two data-consistency fixes surfaced from the lead export:
--   (2) A 'lost' lead should never read as hot/warm — lost = cold.
--   (3) When a conversation is assigned to an agent, the linked lead must show the
--       same assignment (manual "Assign" set only conversations.assigned_agent_id,
--       leaving the lead — and therefore the export — showing unassigned).

-- ── (2) lost ⇒ cold ───────────────────────────────────────────────────────────
-- Force temperature='cold' whenever a lead is (or becomes) 'lost', on any path
-- (AI classifier, manual drag, edit form, or the message-count temp trigger).
CREATE OR REPLACE FUNCTION public.lost_lead_is_cold() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage = 'lost' AND NEW.temperature IS DISTINCT FROM 'cold' THEN
    NEW.temperature := 'cold';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lost_lead_cold ON public.leads;
CREATE TRIGGER trg_lost_lead_cold
BEFORE INSERT OR UPDATE OF stage, temperature ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.lost_lead_is_cold();

-- Backfill existing lost leads.
UPDATE public.leads SET temperature = 'cold', updated_at = now()
WHERE stage = 'lost' AND temperature IS DISTINCT FROM 'cold';

-- ── (3) conversation assignment ⇒ lead assignment ─────────────────────────────
-- Keep the linked lead's assigned_agent_id in sync whenever the conversation's
-- assignment changes (covers manual Assign, smart-assign, and the auto-assign cron).
CREATE OR REPLACE FUNCTION public.sync_lead_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.leads
  SET assigned_agent_id = NEW.assigned_agent_id, updated_at = now()
  WHERE conversation_id = NEW.id
    AND workspace_id = NEW.workspace_id
    AND assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_assignment ON public.conversations;
CREATE TRIGGER trg_sync_lead_assignment
AFTER UPDATE OF assigned_agent_id ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_assignment();

-- Backfill: copy each assigned conversation's agent onto its unassigned lead.
UPDATE public.leads l
SET assigned_agent_id = cv.assigned_agent_id, updated_at = now()
FROM public.conversations cv
WHERE l.conversation_id = cv.id
  AND l.workspace_id = cv.workspace_id
  AND l.assigned_agent_id IS NULL
  AND cv.assigned_agent_id IS NOT NULL;

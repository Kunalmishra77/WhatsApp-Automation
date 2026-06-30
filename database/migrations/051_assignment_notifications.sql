-- Assignment & new-message notifications via triggers, not per-call-site code.
-- assigned_agent_id is written from 4 separate places today (manual assign
-- route, smart-assign route, round-robin balance, inbox-rules-engine 'assign'
-- action) plus any future path — a trigger guarantees every one of them
-- notifies the assignee without having to remember to wire each call site.

CREATE OR REPLACE FUNCTION notify_on_assignment() RETURNS trigger AS $$
BEGIN
  IF NEW.assigned_agent_id IS NOT NULL AND NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    INSERT INTO notifications (workspace_id, user_id, type, title, data)
    VALUES (
      NEW.workspace_id,
      NEW.assigned_agent_id,
      TG_ARGV[0],
      CASE TG_ARGV[0]
        WHEN 'conversation_assigned' THEN 'A conversation was assigned to you'
        WHEN 'lead_assigned'         THEN 'A lead was assigned to you'
      END,
      jsonb_build_object('id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_conversation_assigned ON public.conversations;
CREATE TRIGGER trg_conversation_assigned
  AFTER UPDATE OF assigned_agent_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION notify_on_assignment('conversation_assigned');

DROP TRIGGER IF EXISTS trg_lead_assigned ON public.leads;
CREATE TRIGGER trg_lead_assigned
  AFTER UPDATE OF assigned_agent_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION notify_on_assignment('lead_assigned');

-- New inbound message on an already-assigned conversation → notify the assignee.
-- Skipped if the conversation isn't assigned yet (no one to notify).
CREATE OR REPLACE FUNCTION notify_on_new_message() RETURNS trigger AS $$
DECLARE
  v_assigned_agent_id uuid;
BEGIN
  IF NEW.direction = 'inbound' THEN
    SELECT assigned_agent_id INTO v_assigned_agent_id
    FROM conversations WHERE id = NEW.conversation_id;

    IF v_assigned_agent_id IS NOT NULL THEN
      INSERT INTO notifications (workspace_id, user_id, type, title, data)
      VALUES (
        NEW.workspace_id,
        v_assigned_agent_id,
        'new_message',
        'New message in your conversation',
        jsonb_build_object('conversation_id', NEW.conversation_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_new_message_notify ON public.messages;
CREATE TRIGGER trg_new_message_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_new_message();

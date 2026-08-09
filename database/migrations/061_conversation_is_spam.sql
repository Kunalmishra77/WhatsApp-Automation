-- Engagement-gated spam: conversation-level flag replacing the sticky 'spam' label.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_spam boolean NOT NULL DEFAULT false;

-- Partial index: the Spam view queries the (rare) is_spam=true rows per workspace.
CREATE INDEX IF NOT EXISTS idx_conversations_is_spam
  ON public.conversations (workspace_id)
  WHERE is_spam = true;

-- Backlog cleanup: strip the bad 'spam' label from every conversation that accumulated
-- it (1,415 today, ~100% genuine). is_spam stays false for all existing rows — the
-- historical per-message spam signal was never stored, so detection is forward-only.
UPDATE public.conversations
  SET labels = array_remove(labels, 'spam')
  WHERE 'spam' = ANY(labels);

-- Lead-created clears spam: whenever a lead is created for a contact, un-spam that
-- contact's conversations. Covers every lead-creation path (message flow, Meta ad
-- leads, import, manual) so a genuine lead can never remain flagged spam even if the
-- customer never messages again.
CREATE OR REPLACE FUNCTION public.clear_conversation_spam_on_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
    SET is_spam = false
    WHERE contact_id = NEW.contact_id AND is_spam = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_spam_on_lead ON public.leads;
CREATE TRIGGER trg_clear_spam_on_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.clear_conversation_spam_on_lead();

-- 054_lead_temp_trigger.sql
-- Automatically updates leads.temperature based on message count in the linked conversation.
-- Qualifying messages: sender_type IN ('contact','agent'), type != 'internal_note', is_deleted = false
-- Thresholds: < 4 = cold, 4-7 = warm, >= 8 = hot
-- Never downgrades: UPDATE only fires when new temp rank > current temp rank.
-- Runs alongside the existing keyword-based detectLeadTemperature() in webhook -- both only upgrade.

-- Helper: map count to temperature string
CREATE OR REPLACE FUNCTION public.classify_temp_by_count(v_count INTEGER)
RETURNS VARCHAR(10)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v_count >= 8 THEN 'hot'
    WHEN v_count >= 4 THEN 'warm'
    ELSE 'cold'
  END;
$$;

-- Helper: rank temperature for comparison (hot > warm > cold)
CREATE OR REPLACE FUNCTION public.temperature_rank(temp VARCHAR(10))
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE temp
    WHEN 'hot'  THEN 2
    WHEN 'warm' THEN 1
    ELSE 0
  END;
$$;

-- Trigger function
CREATE OR REPLACE FUNCTION public.update_lead_temp_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id    UUID;
  v_current    VARCHAR(10);
  v_msg_count  INTEGER;
  v_count_temp VARCHAR(10);
BEGIN
  -- Only process qualifying messages
  IF NEW.sender_type NOT IN ('contact', 'agent')        THEN RETURN NEW; END IF;
  IF NEW.type = 'internal_note'                         THEN RETURN NEW; END IF;
  IF NEW.is_deleted = true                              THEN RETURN NEW; END IF;

  -- Find the lead linked to this conversation
  SELECT id, temperature
    INTO v_lead_id, v_current
    FROM public.leads
   WHERE conversation_id = NEW.conversation_id
   LIMIT 1;

  IF v_lead_id IS NULL THEN RETURN NEW; END IF;

  -- Count all qualifying messages in this conversation (including the new one)
  SELECT COUNT(*)
    INTO v_msg_count
    FROM public.messages
   WHERE conversation_id = NEW.conversation_id
     AND sender_type IN ('contact', 'agent')
     AND (type IS NULL OR type != 'internal_note')
     AND is_deleted = false;

  v_count_temp := classify_temp_by_count(v_msg_count);

  -- Only update if the count-based temp is higher than the current temp (never downgrade)
  IF temperature_rank(v_count_temp) > temperature_rank(COALESCE(v_current, 'cold')) THEN
    UPDATE public.leads
       SET temperature = v_count_temp,
           updated_at  = NOW()
     WHERE id = v_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS trg_lead_temp_on_message ON public.messages;

CREATE TRIGGER trg_lead_temp_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_temp_on_message();

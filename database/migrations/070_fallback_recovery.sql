-- ── 070_fallback_recovery.sql ────────────────────────────────────────────────
-- One-off recovery support for the 2026-08-14 AI-provider outage: when the OpenAI
-- key ran out of credits, callAI() returned null and every workspace's auto-reply
-- degraded to the generic "our team will get back to you shortly" fallback. Now that
-- provider failover is live and the bot answers correctly again, these customers
-- are stuck — their conversation's LATEST message is our fallback (not their inbound),
-- so the normal missed-reply watchdog (get_unanswered_conversations, which keys on a
-- latest INBOUND) never re-engages them.
--
-- This function selects those conversations so a recovery pass can send a real reply.
-- Same shape + safety gates as get_unanswered_conversations, but:
--   • latest message must be an OUTBOUND fallback ("get back to you shortly")
--   • last_content returned = the CUSTOMER's most recent inbound (the real question)
--   • last_at returned = the fallback's timestamp (the caller bumps it +1s so the
--     reply-sweep idempotency re-check treats the fallback as already-handled and
--     only skips when a genuine reply has since landed).
--   • customer's last inbound must be within p_inbound_window_hours (WhatsApp's 24h
--     free-form window) so we can legally send a session message.

CREATE OR REPLACE FUNCTION public.get_fallback_conversations(
  p_window_hours int,          -- how far back to look for fallback-answered convos (e.g. 96h)
  p_inbound_window_hours int,  -- customer's last inbound must be within this (e.g. 24h)
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
         -- the customer's most recent inbound message = the real question to answer
         (SELECT mi.content FROM messages mi
            WHERE mi.conversation_id = l.conversation_id AND mi.direction = 'inbound'
            ORDER BY mi.created_at DESC LIMIT 1) AS last_content,
         l.last_at,  -- the fallback's timestamp
         w.phone_number_id, w.access_token, w.settings, w.name
  FROM latest l
  JOIN conversations cv ON cv.id = l.conversation_id
  JOIN contacts ct      ON ct.id = l.contact_id
  JOIN workspaces w     ON w.id  = l.workspace_id
  WHERE l.direction = 'outbound'
    AND l.last_content ILIKE '%get back to you shortly%'
    AND cv.status IN ('open','assigned','pending')
    AND COALESCE(cv.bot_paused, false) = false
    AND COALESCE(ct.is_blocked, false) = false
    AND COALESCE(ct.opted_out, false) = false
    AND w.phone_number_id IS NOT NULL
    AND w.access_token IS NOT NULL
    AND COALESCE(w.settings->>'agent_persona', '') <> ''
    -- customer's most recent inbound is within the 24h WhatsApp session window
    AND EXISTS (
      SELECT 1 FROM messages mi
      WHERE mi.conversation_id = l.conversation_id AND mi.direction = 'inbound'
        AND mi.created_at > now() - (p_inbound_window_hours || ' hours')::interval
    )
    AND NOT EXISTS (
      SELECT 1 FROM flow_sessions fs
      WHERE fs.conversation_id = l.conversation_id AND fs.status = 'active'
    )
  ORDER BY l.last_at ASC
  LIMIT p_limit;
$$;

-- SECURITY: SECURITY DEFINER + returns every workspace's WhatsApp access_token —
-- revoke from all client roles; only the service-role admin client may call it.
REVOKE EXECUTE ON FUNCTION public.get_fallback_conversations(int, int, int) FROM PUBLIC, anon, authenticated;

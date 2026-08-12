-- 066_reply_sweep_status_fix.sql
-- HOTFIX: the missed-reply watchdog (get_unanswered_conversations, migration 057) only
-- recovered conversations with status='open'. Campaign-reply conversations are auto-set to
-- 'assigned' (and escalations to 'pending'), where the REAL-TIME bot still replies — so when
-- the real-time path drops a reply under campaign-burst load, those conversations had NO
-- safety net and the customer was left permanently unanswered (observed: Razorveda customers
-- tapping "Order Now"/"Shop Now" from campaigns got no reply).
-- Fix: cover status IN ('open','assigned','pending'), still gated by bot_paused=false (the
-- explicit "a human has taken over" signal) + the existing no-later-outbound idempotency,
-- so the watchdog now matches the real-time bot's actual reply scope.

CREATE OR REPLACE FUNCTION public.get_unanswered_conversations(p_min_age_minutes integer, p_window_hours integer, p_limit integer)
 RETURNS TABLE(conversation_id uuid, workspace_id uuid, contact_id uuid, phone text, name text, last_content text, last_at timestamp with time zone, phone_number_id text, access_token text, settings jsonb, business_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
         l.last_content, l.last_at, w.phone_number_id, w.access_token, w.settings, w.name
  FROM latest l
  JOIN conversations cv ON cv.id = l.conversation_id
  JOIN contacts ct      ON ct.id = l.contact_id
  JOIN workspaces w     ON w.id  = l.workspace_id
  WHERE l.direction = 'inbound'
    AND l.last_at <= now() - (p_min_age_minutes || ' minutes')::interval
    AND cv.status IN ('open','assigned','pending')   -- was: cv.status = 'open'
    AND COALESCE(cv.bot_paused, false) = false
    AND COALESCE(ct.is_blocked, false) = false
    AND COALESCE(ct.opted_out, false) = false
    AND w.phone_number_id IS NOT NULL
    AND w.access_token IS NOT NULL
    AND COALESCE(w.settings->>'agent_persona', '') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM messages o
      WHERE o.conversation_id = l.conversation_id AND o.direction = 'outbound' AND o.created_at >= l.last_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM flow_sessions fs
      WHERE fs.conversation_id = l.conversation_id AND fs.status = 'active'
    )
  ORDER BY l.last_at ASC
  LIMIT p_limit;
$function$;

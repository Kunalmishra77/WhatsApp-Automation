-- 120 — Mark the "leads" that are another company's auto-responder.
--
-- Messaging a WhatsApp Business account triggers its automated greeting, which
-- arrives as an ordinary inbound message and becomes a lead. For the clients
-- doing B2B outreach that is most of their list: Lennore 52%, V4you 52%, VMS 45%,
-- Santure 44%, The Health Mechanix 29% — about 975 conversations in all. Their
-- scores sit near the floor because no person is behind them (Lennore averages
-- 12/100), which drags down every average the client reads.
--
-- They are FLAGGED, not deleted or hidden. A human at that business often replies
-- after the greeting, and that is a real B2B lead — which is also why the bot
-- still answers them. The flag lets a client separate the two; it does not decide
-- for them.
--
-- Only the FIRST inbound of a conversation counts. The same words later in a
-- thread are a person being polite, and flagging those would mark buyers as noise
-- — the costlier mistake, since the point is to clean up reporting rather than
-- hide customers.
--
-- The patterns mirror lib/business-greeting.ts, including its 40-character floor:
-- a bare "welcome" or "thank you" from a real person must not match.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_business_reply boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.is_business_reply IS
  'True when this lead''s conversation opened with another business''s automated WhatsApp greeting rather than a person. Flagged for reporting, never hidden.';

-- Partial index: the flagged rows are the minority and the only ones filtered on.
CREATE INDEX IF NOT EXISTS leads_business_reply_idx
  ON public.leads (workspace_id) WHERE is_business_reply;

WITH first_inbound AS (
  SELECT DISTINCT ON (m.conversation_id)
         m.conversation_id,
         m.content
  FROM public.messages m
  WHERE m.direction = 'inbound'
  ORDER BY m.conversation_id, m.created_at ASC
),
auto AS (
  SELECT conversation_id
  FROM first_inbound
  WHERE length(btrim(content)) >= 40
    AND (
         content ~* '\mwelcome to\M'
      OR content ~* '\mthank you for (contacting|reaching out to|connecting with|your (message|enquiry|inquiry|interest))\M'
      OR content ~* '\mthanks for (contacting|reaching out to|connecting with)\M'
      OR content ~* '\mgreetings from\M'
      OR content ~* '\mwe(''| a)re (currently )?(unavailable|not available|away|closed)\M'
      OR content ~* '\mwe (will|''ll) (revert|get back to you|respond)\M'
      OR content ~* '\mour (team|representative) will (contact|reach|get back)\M'
      OR content ~* '\mthis is an automated (message|reply|response)\M'
      OR content LIKE '%से जुड़ने के लिए आपका धन्यवाद%'
      OR content LIKE '%संपर्क करने के लिए धन्यवाद%'
      OR content LIKE '%में आपका स्वागत है%'
    )
)
UPDATE public.leads l
SET is_business_reply = true
FROM auto a
WHERE l.conversation_id = a.conversation_id
  AND l.is_business_reply = false;

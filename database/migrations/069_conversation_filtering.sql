-- 069_conversation_filtering.sql — denormalized campaign source + filter indexes.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS source_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_ws_campaign ON public.conversations (workspace_id, source_campaign_id);
CREATE INDEX IF NOT EXISTS idx_conversations_ws_created ON public.conversations (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_ws_firstreplied ON public.conversations (workspace_id, first_replied_at);
CREATE INDEX IF NOT EXISTS idx_leads_conversation ON public.leads (conversation_id);

-- Backfill: earliest campaign per conversation.
UPDATE public.conversations c
SET source_campaign_id = cr.campaign_id
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, campaign_id
  FROM public.campaign_recipients
  WHERE conversation_id IS NOT NULL
  ORDER BY conversation_id, sent_at ASC NULLS LAST
) cr
WHERE cr.conversation_id = c.id AND c.source_campaign_id IS NULL;

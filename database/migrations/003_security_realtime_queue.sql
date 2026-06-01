-- 003_security_realtime_queue.sql
-- Hardens RLS, enables realtime publication, and adds durable webhook queue state.

BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload         JSONB NOT NULL,
  signature       TEXT,
  status          TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  meta_message_ids TEXT[] NOT NULL DEFAULT '{}',
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_status
  ON public.whatsapp_webhook_events(status, received_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_message_ids
  ON public.whatsapp_webhook_events USING gin(meta_message_ids);

CREATE UNIQUE INDEX IF NOT EXISTS messages_whatsapp_msg_id_unique
  ON public.messages(whatsapp_msg_id)
  WHERE whatsapp_msg_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_phone_number_id
  ON public.workspaces(phone_number_id)
  WHERE phone_number_id IS NOT NULL;

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_webhook_events_no_client_access" ON public.whatsapp_webhook_events;
CREATE POLICY "whatsapp_webhook_events_no_client_access" ON public.whatsapp_webhook_events
  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "messages_insert_workspace" ON public.messages;
DROP POLICY IF EXISTS "conversations_insert_workspace" ON public.conversations;

DROP POLICY IF EXISTS "contacts_workspace_isolation" ON public.contacts;
CREATE POLICY "contacts_workspace_isolation" ON public.contacts
  FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "conversations_workspace_isolation" ON public.conversations;
CREATE POLICY "conversations_workspace_isolation" ON public.conversations
  FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "messages_workspace_isolation" ON public.messages;
CREATE POLICY "messages_workspace_isolation" ON public.messages
  FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "leads_workspace_isolation" ON public.leads;
CREATE POLICY "leads_workspace_isolation" ON public.leads
  FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "templates_workspace_isolation" ON public.templates;
CREATE POLICY "templates_workspace_isolation" ON public.templates
  FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "campaigns_workspace_isolation" ON public.campaigns;
CREATE POLICY "campaigns_workspace_isolation" ON public.campaigns
  FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "activities_workspace_isolation" ON public.activities;
CREATE POLICY "activities_workspace_isolation" ON public.activities
  FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

COMMIT;

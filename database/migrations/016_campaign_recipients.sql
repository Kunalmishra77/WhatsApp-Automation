BEGIN;

-- Per-recipient tracking for campaigns
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES public.contacts(id),
  phone           VARCHAR(50) NOT NULL,
  name            TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'sent', -- sent/delivered/read/failed/replied
  whatsapp_msg_id TEXT,
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  error_message   TEXT,
  conversation_id UUID REFERENCES public.conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_cr_campaign    ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cr_wa_msg      ON public.campaign_recipients(whatsapp_msg_id) WHERE whatsapp_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cr_workspace   ON public.campaign_recipients(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cr_contact     ON public.campaign_recipients(contact_id)  WHERE contact_id IS NOT NULL;

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cr_workspace" ON public.campaign_recipients;
CREATE POLICY "cr_workspace" ON public.campaign_recipients FOR ALL
  USING  (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

-- Media fields for campaigns (optional attachment sent after template)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS media_id   TEXT,        -- WhatsApp media ID (valid 30 days)
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(20); -- image / video / document

COMMIT;

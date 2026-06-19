-- 040: Pre-flight contact filtering — WhatsApp validation cache + engagement filter

-- contacts: cache whether a phone is registered on WhatsApp (7-day TTL)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS whatsapp_valid       BOOLEAN,
  ADD COLUMN IF NOT EXISTS whatsapp_checked_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_wa_valid
  ON contacts(workspace_id, phone, whatsapp_valid, whatsapp_checked_at)
  WHERE whatsapp_valid = false;

-- campaign_recipients: new 'filtered' status + reason
ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS filtered_reason TEXT;

-- campaigns: track filtered count separately
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS filtered_count INTEGER DEFAULT 0;

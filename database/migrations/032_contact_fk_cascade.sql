-- Fix: contacts delete was failing due to NO ACTION FK constraints
-- Change leads, csat_responses, campaign_recipients to CASCADE

-- leads
ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_contact_id_fkey;
ALTER TABLE leads
  ADD CONSTRAINT leads_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- csat_responses
ALTER TABLE csat_responses
  DROP CONSTRAINT IF EXISTS csat_responses_contact_id_fkey;
ALTER TABLE csat_responses
  ADD CONSTRAINT csat_responses_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- campaign_recipients
ALTER TABLE campaign_recipients
  DROP CONSTRAINT IF EXISTS campaign_recipients_contact_id_fkey;
ALTER TABLE campaign_recipients
  ADD CONSTRAINT campaign_recipients_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- 039: Campaign reply tracking — capture what the recipient actually replied
ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS reply_text  TEXT,
  ADD COLUMN IF NOT EXISTS reply_type  VARCHAR(20);   -- 'button' | 'text'

CREATE INDEX IF NOT EXISTS idx_cr_reply_type
  ON campaign_recipients(campaign_id, reply_type)
  WHERE reply_type IS NOT NULL;

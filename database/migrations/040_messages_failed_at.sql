-- 040: Add failed_at column to messages table
-- Referenced in webhook status handler but was missing from schema causing
-- "[Webhook] Processing failed: Could not find the 'failed_at' column" errors.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

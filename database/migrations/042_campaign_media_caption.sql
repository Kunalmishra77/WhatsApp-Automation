-- Add caption/text field to campaigns for media-only campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS media_caption TEXT;

-- 034: Add missing columns to media_library (public_url, tags, description)
-- These are required by the API routes added after migration 024 was created.

ALTER TABLE media_library
  ADD COLUMN IF NOT EXISTS public_url   TEXT,
  ADD COLUMN IF NOT EXISTS tags         TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description  TEXT;

-- Unique constraint so POST can upsert by (workspace_id, media_id)
ALTER TABLE media_library
  DROP CONSTRAINT IF EXISTS media_library_workspace_media_unique;

ALTER TABLE media_library
  ADD CONSTRAINT media_library_workspace_media_unique
  UNIQUE (workspace_id, media_id);

-- 038: Workspace soft delete (7-day trash bin) + media library recents

-- Workspace soft delete: deleted_at NULL = active, NOT NULL = in trash
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Media library: track when a URL was last copied so we can show recents
ALTER TABLE media_library
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL;

-- Index for trash queries (only non-null deleted_at rows)
CREATE INDEX IF NOT EXISTS workspaces_deleted_at_idx
  ON workspaces(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Index for media recents queries
CREATE INDEX IF NOT EXISTS media_library_last_used_at_idx
  ON media_library(workspace_id, last_used_at DESC)
  WHERE last_used_at IS NOT NULL;

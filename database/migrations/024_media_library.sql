-- 024: Media Library — persists WhatsApp media IDs for reuse in campaigns

CREATE TABLE IF NOT EXISTS media_library (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename     VARCHAR(500) NOT NULL,
  media_id     VARCHAR(200) NOT NULL,   -- WhatsApp media ID (valid ~30 days)
  media_type   VARCHAR(20)  NOT NULL,   -- image | video | document
  mime_type    VARCHAR(100),
  file_size    BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ml_workspace_created_idx
  ON media_library (workspace_id, created_at DESC);

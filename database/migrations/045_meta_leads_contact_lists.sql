-- Migration 045: Meta Ad Leads + Contact Folder Organization
-- Run in Supabase SQL editor

-- ── 1. GIN index on conversations.meta for fast ad_source queries ──────────
CREATE INDEX IF NOT EXISTS idx_conversations_meta_gin
  ON conversations USING GIN (meta jsonb_path_ops);

-- ── 2. Helper function: append a label to a conversation without overwriting ─
CREATE OR REPLACE FUNCTION append_conversation_label(
  p_conversation_id uuid,
  p_label           text
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE conversations
  SET labels = CASE
    WHEN p_label = ANY(labels) THEN labels
    ELSE labels || ARRAY[p_label]
  END
  WHERE id = p_conversation_id;
$$;

-- ── 3. contact_lists (folders) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_lists (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  source       VARCHAR(50) DEFAULT 'manual',   -- 'csv' | 'excel' | 'meta_ad' | 'manual'
  description  TEXT,
  color        VARCHAR(20) DEFAULT 'gray',     -- gray | blue | green | orange | purple | red
  created_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_lists_workspace ON contact_lists(workspace_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_contact_lists_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_contact_lists_updated_at ON contact_lists;
CREATE TRIGGER trg_contact_lists_updated_at
  BEFORE UPDATE ON contact_lists
  FOR EACH ROW EXECUTE FUNCTION touch_contact_lists_updated_at();

-- ── 4. contact_list_members (many-to-many) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_list_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    UUID        NOT NULL REFERENCES contact_lists(id)  ON DELETE CASCADE,
  contact_id UUID        NOT NULL REFERENCES contacts(id)       ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_clm_list    ON contact_list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_clm_contact ON contact_list_members(contact_id);

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE contact_lists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_list_members ENABLE ROW LEVEL SECURITY;

-- contact_lists: users can only see/edit lists for their own workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contact_lists' AND policyname = 'workspace_isolation_lists'
  ) THEN
    CREATE POLICY workspace_isolation_lists ON contact_lists
      USING (
        workspace_id = (
          SELECT workspace_id FROM profiles WHERE id = auth.uid()
        )
      );
  END IF;
END$$;

-- contact_list_members: accessible if their list belongs to the user's workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contact_list_members' AND policyname = 'workspace_isolation_list_members'
  ) THEN
    CREATE POLICY workspace_isolation_list_members ON contact_list_members
      USING (
        list_id IN (
          SELECT id FROM contact_lists
          WHERE workspace_id = (
            SELECT workspace_id FROM profiles WHERE id = auth.uid()
          )
        )
      );
  END IF;
END$$;

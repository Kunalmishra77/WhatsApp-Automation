-- Migration 046: Meta Ad Pre-fill Messages registry
-- Allows clients to register known pre-filled messages from their Meta ad templates
-- so that conversations starting with those messages are auto-tagged as Meta Ad Leads

CREATE TABLE IF NOT EXISTS meta_ad_prefill_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  template_name VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, text)
);

CREATE INDEX IF NOT EXISTS idx_prefill_workspace ON meta_ad_prefill_messages(workspace_id);

ALTER TABLE meta_ad_prefill_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_isolation_prefill" ON meta_ad_prefill_messages
  USING (workspace_id = (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

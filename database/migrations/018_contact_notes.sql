-- 018: Contact Notes + bot_paused + ai_summary + lead_temperature + custom_field_definitions

-- ── Contact Notes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES contacts(id)   ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_notes_contact_idx    ON contact_notes (contact_id);
CREATE INDEX IF NOT EXISTS contact_notes_workspace_idx  ON contact_notes (workspace_id);

ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON contact_notes
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- ── Session Pause / Resume ─────────────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS bot_paused BOOLEAN NOT NULL DEFAULT false;

-- ── Chat Summarization ─────────────────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- ── Lead Temperature ──────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS temperature VARCHAR(10) NOT NULL DEFAULT 'warm'
  CHECK (temperature IN ('hot', 'warm', 'cold'));

-- ── Custom Field Definitions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  label        VARCHAR(100) NOT NULL,
  field_type   VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'date', 'select')),
  options      JSONB,                        -- for select type: array of option strings
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS custom_field_defs_workspace_idx ON custom_field_definitions (workspace_id);

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON custom_field_definitions
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

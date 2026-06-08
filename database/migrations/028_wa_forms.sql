-- Migration 028: WhatsApp Forms
-- Multi-step question forms sent via WhatsApp with response tracking

CREATE TABLE IF NOT EXISTS wa_forms (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  questions           JSONB NOT NULL DEFAULT '[]',
  -- [{ "id":"q1","text":"Your name?","type":"text|email|phone|number|choice|date",
  --    "required":true,"options":["A","B","C"],"placeholder":"..." }]
  completion_message  TEXT NOT NULL DEFAULT 'Thank you for your response! We will be in touch soon.',
  total_responses     INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks an in-progress form being filled by a contact
CREATE TABLE IF NOT EXISTS wa_form_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id               UUID NOT NULL REFERENCES wa_forms(id) ON DELETE CASCADE,
  workspace_id          UUID NOT NULL,
  conversation_id       UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
  current_question_idx  INTEGER NOT NULL DEFAULT 0,
  answers               JSONB NOT NULL DEFAULT '{}',  -- { "q1": "John", "q2": "Option A" }
  status                VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','completed','abandoned')),
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

-- Completed form submissions
CREATE TABLE IF NOT EXISTS wa_form_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         UUID NOT NULL REFERENCES wa_forms(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name    TEXT,
  contact_phone   TEXT,
  answers         JSONB NOT NULL DEFAULT '{}',
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_forms_workspace        ON wa_forms(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wa_form_sessions_form     ON wa_form_sessions(form_id);
CREATE INDEX IF NOT EXISTS idx_wa_form_sessions_contact  ON wa_form_sessions(contact_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_form_sessions_conv     ON wa_form_sessions(conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_form_responses_form    ON wa_form_responses(form_id);

ALTER TABLE wa_forms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_form_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_form_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_wa_forms"     ON wa_forms     FOR ALL USING (EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = wa_forms.workspace_id     AND user_id = auth.uid()));
CREATE POLICY "ws_form_sessions" ON wa_form_sessions FOR ALL USING (EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = wa_form_sessions.workspace_id AND user_id = auth.uid()));
CREATE POLICY "ws_form_responses" ON wa_form_responses FOR ALL USING (EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = wa_form_responses.workspace_id AND user_id = auth.uid()));

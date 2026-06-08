-- Migration 027: Chat Widget
-- Floating WhatsApp button embeddable on any website

CREATE TABLE IF NOT EXISTS chat_widgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  embed_key    VARCHAR(32) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  name         VARCHAR(255) NOT NULL DEFAULT 'My Widget',
  is_active    BOOLEAN NOT NULL DEFAULT true,

  -- Display config
  phone_number     TEXT NOT NULL,      -- WhatsApp number to open (E.164)
  prefill_message  TEXT DEFAULT 'Hello! I have a question.',
  greeting_text    TEXT DEFAULT 'Hi there! How can we help you?',
  business_name    TEXT DEFAULT 'Support',
  avatar_url       TEXT,
  button_color     VARCHAR(20) DEFAULT '#25D366',
  position         VARCHAR(20) DEFAULT 'bottom-right' CHECK (position IN ('bottom-right','bottom-left')),
  button_label     TEXT DEFAULT 'Chat with us',
  show_label       BOOLEAN DEFAULT true,

  -- Stats
  total_clicks     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_widgets_workspace  ON chat_widgets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_widgets_embed_key  ON chat_widgets(embed_key);

ALTER TABLE chat_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_chat_widgets" ON chat_widgets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = chat_widgets.workspace_id AND user_id = auth.uid())
  );

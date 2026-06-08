-- Migration 029: Instagram Inbox
-- Stores connected Instagram Business accounts per workspace.
-- Conversations already have a `channel` column (VARCHAR DEFAULT 'whatsapp').
-- Instagram conversations use channel='instagram' and store ig_sender_id in meta JSONB.

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ig_user_id      VARCHAR(255) NOT NULL,   -- Instagram Business Account ID
  page_id         VARCHAR(255),            -- Connected Facebook Page ID
  access_token    TEXT NOT NULL,           -- Page access token (long-lived)
  username        VARCHAR(255),
  name            VARCHAR(255),
  profile_pic     TEXT,
  webhook_verified BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id)                     -- one IG account per workspace for now
);

-- RLS
ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_read_instagram_accounts"
  ON instagram_accounts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_admins_can_manage_instagram_accounts"
  ON instagram_accounts FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

-- database/migrations/044_admin_v2.sql

-- Announcements table: superadmin broadcasts to clients
CREATE TABLE IF NOT EXISTS admin_announcements (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  message      text        NOT NULL,
  target_plan  text        DEFAULT NULL,  -- NULL = all clients, 'pro' = pro only, etc.
  sent_at      timestamptz DEFAULT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES profiles(id)
);

-- Feature flags: toggle features per workspace
CREATE TABLE IF NOT EXISTS workspace_feature_flags (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  flag_name    text        NOT NULL,
  is_enabled   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, flag_name)
);

-- Internal admin notes per client
CREATE TABLE IF NOT EXISTS admin_client_notes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  note         text        NOT NULL,
  created_by   uuid        REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Add replied_count to campaigns (safe to run even if exists)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS replied_count int NOT NULL DEFAULT 0;

-- RLS
ALTER TABLE admin_announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_client_notes      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_announcements_admin_only"
  ON admin_announcements FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "feature_flags_admin_only"
  ON workspace_feature_flags FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "client_notes_admin_only"
  ON admin_client_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));

-- database/migrations/043_meta_billing.sql

CREATE TABLE IF NOT EXISTS meta_billing_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  waba_id       text        NOT NULL,
  month         date        NOT NULL,  -- first day of month e.g. 2026-06-01
  marketing_count  int      NOT NULL DEFAULT 0,
  utility_count    int      NOT NULL DEFAULT 0,
  auth_count       int      NOT NULL DEFAULT 0,
  service_count    int      NOT NULL DEFAULT 0,
  total_inr     decimal(10,2) NOT NULL DEFAULT 0,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, month)
);

ALTER TABLE meta_billing_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage meta_billing_snapshots"
  ON meta_billing_snapshots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

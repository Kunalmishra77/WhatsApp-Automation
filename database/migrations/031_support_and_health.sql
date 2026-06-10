-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 031: Support Tickets + Platform Health Reports
-- ─────────────────────────────────────────────────────────────────────────────

-- Support tickets submitted by clients
CREATE TABLE IF NOT EXISTS support_tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  subject       TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'general',   -- general | billing | technical | bug
  priority      TEXT NOT NULL DEFAULT 'medium',    -- low | medium | high | urgent
  status        TEXT NOT NULL DEFAULT 'open',      -- open | in_progress | resolved | closed
  submitted_by  TEXT,                              -- email of submitter
  admin_reply   TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can manage own tickets"
  ON support_tickets FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_support_tickets_workspace ON support_tickets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status    ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created   ON support_tickets(created_at DESC);

-- Platform health reports saved by the health-monitor cron agent
CREATE TABLE IF NOT EXISTS platform_health_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overall_status  TEXT NOT NULL DEFAULT 'healthy',  -- healthy | warning | critical
  checks          JSONB NOT NULL DEFAULT '{}',
  errors          JSONB NOT NULL DEFAULT '[]',
  has_errors      BOOLEAN NOT NULL DEFAULT false,
  error_resolved_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_health_reports ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read health reports (checked server-side, RLS is secondary guard)
CREATE POLICY "platform admins only"
  ON platform_health_reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_health_reports_checked ON platform_health_reports(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_reports_errors  ON platform_health_reports(has_errors);

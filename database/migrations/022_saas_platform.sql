-- 022: SaaS Platform Infrastructure

-- ── Platform Admin flag on profiles ───────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- ── Workspace SaaS columns ────────────────────────────────────────────────────
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS is_active              BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS onboarding_complete    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_email            VARCHAR(255),
  ADD COLUMN IF NOT EXISTS owner_phone            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS industry               VARCHAR(100),
  ADD COLUMN IF NOT EXISTS subscription_status    VARCHAR(50)  NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS next_billing_date      DATE,
  ADD COLUMN IF NOT EXISTS payment_failed_at      TIMESTAMPTZ;

-- subscription_status values: active | halted | cancelled | expired | trialing

-- ── Platform Usage Logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_usage_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  month            VARCHAR(7)  NOT NULL,   -- format: '2026-06'
  messages_sent    INTEGER     NOT NULL DEFAULT 0,
  messages_in      INTEGER     NOT NULL DEFAULT 0,
  campaigns_run    INTEGER     NOT NULL DEFAULT 0,
  contacts_created INTEGER     NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ          DEFAULT NOW(),
  UNIQUE(workspace_id, month)
);

CREATE INDEX IF NOT EXISTS pul_workspace_month
  ON platform_usage_logs (workspace_id, month);

-- ── Update razorpay-billing plan limits to match SAAS_PLAN ───────────────────
-- Starter plan limits stored in plan_limits JSONB on workspaces:
-- { "agents": 2, "messages_per_month": 3000, "campaigns_per_month": 5, "kb_entries": 30 }
-- Pro plan limits:
-- { "agents": 10, "messages_per_month": 25000, "campaigns_per_month": 50, "kb_entries": 500 }
-- Enterprise plan limits:
-- { "agents": 25, "messages_per_month": 100000, "campaigns_per_month": 200, "kb_entries": 2000 }

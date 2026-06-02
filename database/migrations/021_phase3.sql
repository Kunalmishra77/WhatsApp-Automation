-- 021: Phase 3 — Enterprise & Scale

-- ── pgvector for Semantic Search ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS kb_embedding_idx
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── Async Campaign Queue ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress      INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  sent          INTEGER NOT NULL DEFAULT 0,
  failed        INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cq_campaign_idx ON campaign_queue (campaign_id);
CREATE INDEX IF NOT EXISTS cq_pending_idx  ON campaign_queue (status) WHERE status IN ('pending','processing');

-- ── White Label / Branding ────────────────────────────────────────────────────
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS brand_color   VARCHAR(20)  DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS favicon_url   TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255);

-- ── Stripe Billing ────────────────────────────────────────────────────────────
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS stripe_customer_id   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS plan_expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_limits           JSONB NOT NULL DEFAULT '{
    "agents": 3,
    "messages_per_month": 1000,
    "campaigns_per_month": 5,
    "kb_entries": 50
  }';

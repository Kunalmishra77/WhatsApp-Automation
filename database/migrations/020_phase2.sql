-- 020: Phase 2 — Agentix Exclusive Features

-- ── Contact Lifecycle Stages ──────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(20) NOT NULL DEFAULT 'lead'
  CHECK (lifecycle_stage IN ('lead', 'prospect', 'customer', 'churned'));

-- ── VIP Contacts ──────────────────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT false;

-- ── Sentiment on Conversations ────────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS sentiment VARCHAR(10)
  CHECK (sentiment IN ('positive', 'neutral', 'negative'));

-- ── AI Lead Score ─────────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100);

-- ── Revenue Attribution — link order to conversation ─────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_conversation_idx ON orders (conversation_id);

-- ── Smart Auto-Assignment — expertise tags on profiles ────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS expertise_tags TEXT[] NOT NULL DEFAULT '{}';

-- ── A/B Testing on Campaigns ──────────────────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS ab_test_group   VARCHAR(1),        -- 'A' or 'B'
  ADD COLUMN IF NOT EXISTS parent_campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS campaigns_parent_idx ON campaigns (parent_campaign_id);

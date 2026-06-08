-- Migration 030: AI Revenue Intelligence
-- Stores AI-generated insights per contact: lead score, hot lead flag,
-- buy signals, and best time to engage.

CREATE TABLE IF NOT EXISTS contact_insights (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id       UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_score       SMALLINT DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  hot_lead         BOOLEAN DEFAULT false,
  buy_signals      TEXT[] DEFAULT '{}',
  best_send_hour   SMALLINT CHECK (best_send_hour BETWEEN 0 AND 23), -- UTC hour
  insights_summary TEXT,
  last_analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_insights_workspace ON contact_insights(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contact_insights_score     ON contact_insights(workspace_id, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_contact_insights_hot       ON contact_insights(workspace_id, hot_lead) WHERE hot_lead = true;

ALTER TABLE contact_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_insights"
  ON contact_insights FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- 019: Time-Based Automation Triggers

-- Per-conversation scheduled action queue
CREATE TABLE IF NOT EXISTS time_trigger_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id)    ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id)          ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id)               ON DELETE CASCADE,
  trigger_at      TIMESTAMPTZ NOT NULL,
  action_type     VARCHAR(50) NOT NULL CHECK (action_type IN ('send_message', 'auto_close', 'assign_agent', 'resume_flow')),
  action_data     JSONB NOT NULL DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
  executed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ttq_workspace_idx ON time_trigger_queue (workspace_id);
CREATE INDEX IF NOT EXISTS ttq_pending_idx   ON time_trigger_queue (trigger_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ttq_conv_idx      ON time_trigger_queue (conversation_id);

-- Workspace idle trigger config (stored in workspace_settings or a simple config row)
CREATE TABLE IF NOT EXISTS workspace_time_trigger_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  idle_close_enabled  BOOLEAN NOT NULL DEFAULT false,
  idle_close_hours    INTEGER NOT NULL DEFAULT 24,
  idle_message        TEXT,                       -- optional message to send before closing
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

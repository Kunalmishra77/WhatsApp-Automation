-- Migration 026: Automation Triggers
-- Event-based automations: birthday, re-engagement, abandoned cart

CREATE TABLE IF NOT EXISTS automation_triggers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  trigger_type    VARCHAR(50)  NOT NULL CHECK (trigger_type IN ('birthday', 're_engagement', 'abandoned_cart')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  message         TEXT NOT NULL,           -- WA message to send
  config          JSONB NOT NULL DEFAULT '{}',
  -- birthday:       { "custom_field_key": "birthday" }
  -- re_engagement:  { "days": 7, "tags_filter": [] }
  -- abandoned_cart: { "webhook_secret": "xxx", "delay_minutes": 30 }
  audience_filter JSONB NOT NULL DEFAULT '{}',
  -- { "tags": ["customer"], "lifecycle_stage": "prospect" }
  last_ran_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_trigger_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id   UUID NOT NULL REFERENCES automation_triggers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_phone TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error        TEXT,
  executed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_triggers_workspace  ON automation_triggers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automation_triggers_type       ON automation_triggers(trigger_type, is_active);
CREATE INDEX IF NOT EXISTS idx_automation_trigger_logs_trigger ON automation_trigger_logs(trigger_id);
CREATE INDEX IF NOT EXISTS idx_automation_trigger_logs_contact ON automation_trigger_logs(contact_id);

ALTER TABLE automation_triggers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_trigger_logs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_automation_triggers" ON automation_triggers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = automation_triggers.workspace_id AND user_id = auth.uid())
  );

CREATE POLICY "workspace_automation_trigger_logs" ON automation_trigger_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = automation_trigger_logs.workspace_id AND user_id = auth.uid())
  );

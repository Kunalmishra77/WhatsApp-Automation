-- Conversation Events: auto-detected bookings, callbacks, appointments
CREATE TABLE IF NOT EXISTS conversation_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  event_type        TEXT NOT NULL CHECK (event_type IN ('demo_booked','callback_requested','appointment_set','not_interested','follow_up')),
  contact_name      TEXT,
  contact_phone     TEXT,
  scheduled_at      TIMESTAMPTZ,
  location          TEXT,
  notes             TEXT,
  google_event_id   TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','done','cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_events_workspace ON conversation_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conv_events_type ON conversation_events(workspace_id, event_type);
CREATE INDEX IF NOT EXISTS idx_conv_events_created ON conversation_events(workspace_id, created_at DESC);

ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY conv_events_workspace ON conversation_events
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- Store Google Calendar OAuth tokens per workspace in settings JSONB (no new column needed)
-- settings->>'google_calendar_refresh_token', settings->>'google_calendar_id'

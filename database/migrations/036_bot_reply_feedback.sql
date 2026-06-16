-- Bot Reply Feedback: lets an operator flag a bot-generated reply as wrong
-- directly from the conversation UI, closing the loop between "agent is
-- inaccurate" and "here's specifically what to fix" in the KB/persona.
CREATE TABLE IF NOT EXISTS bot_reply_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  note            TEXT,
  marked_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  marked_bad_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_reply_feedback_workspace ON bot_reply_feedback(workspace_id, marked_bad_at DESC);

ALTER TABLE bot_reply_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY bot_reply_feedback_workspace ON bot_reply_feedback
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- 146 — The same change for `messages`. Run only after 144 has held.
--
-- ⚠️  READ docs/realtime-wal-change.md FIRST. Do not run this in the same
--     sitting as 144: if the inbox breaks, two changes at once means not
--     knowing which one did it.
--
-- Second in size, not first: 41,128 updates against conversations' 118,382,
-- and a 669-byte row against 934. Worth doing, worth doing second.
--
-- Where its updates come from — the delivery receipts, three per outbound
-- message (sent → delivered → read), each rewriting the whole old row
-- including `content` and `meta`:
--
--   messages WHERE whatsapp_msg_id = $1   41,803 + 28,670 calls
--
-- Migration 130 already stopped the no-op `sent` receipt from rewriting a row
-- that was already 'sent'. This stops the remaining ones from carrying the
-- message body into WAL to do it.
--
-- The RLS policy is `can_view_message_row(workspace_id, conversation_id)`, and
-- both are NOT NULL — so unlike `conversations`, the replica identity index can
-- carry **everything the policy needs**. A DELETE event stays fully
-- RLS-checkable here, which is why this one has no degraded case at all.
--
-- `messages` has had 0 deletes in 44 days either way.

CREATE UNIQUE INDEX IF NOT EXISTS messages_replident
  ON public.messages (workspace_id, conversation_id, id);

ALTER TABLE public.messages
  REPLICA IDENTITY USING INDEX messages_replident;

COMMENT ON INDEX public.messages_replident IS
  'Replica identity for logical replication (migration 146). Carries both columns can_view_message_row() needs, so DELETE events stay RLS-checkable. Rollback: migration 145.';

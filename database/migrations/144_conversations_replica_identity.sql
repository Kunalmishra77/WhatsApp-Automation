-- 144 — Stop writing the whole conversation row into WAL on every update.
--
-- ⚠️  READ docs/realtime-wal-change.md BEFORE RUNNING THIS. It needs someone
--     watching the Conversations page for five minutes afterwards, and the
--     rollback is migration 145.
--
-- Realtime WAL decoding is the largest single consumer of database time on this
-- platform: 2,343,638 calls, 14,123 seconds — 3.9 hours, roughly ten times
-- anything else. Every table in the `supabase_realtime` publication is
-- REPLICA IDENTITY FULL, which means every UPDATE writes the *entire old row*
-- into WAL so Realtime can re-check RLS against it.
--
-- Measured, 44 days:
--
--   conversations   118,382 updates   avg row  934 B   ← this file
--   messages         41,128 updates   avg row  669 B
--   notifications         16 updates   avg row  203 B
--
-- `conversations` is 2.9× the update volume of `messages` and carries bigger
-- rows, so it is roughly four times the burden. Worth saying plainly because
-- memory/scalability-measured-baseline.md says messages "is where the volume
-- is" and names `conversations` as the one that cannot be changed. The first
-- half is wrong and the second is only half right.
--
-- Why it is updated so often — five separate single-column UPDATEs to the same
-- row per inbound message, each writing all 934 bytes of the old row:
--
--   last_message + last_message_at   15,028
--   is_spam                          14,536
--   sentiment                        12,394
--   unread_count                     10,792
--   consecutive_offtopic              6,882
--
-- Collapsing those five into one is the other way to fix this, and a better one
-- — but they are scattered across a 3,800-line webhook, several inside
-- fire-and-forget blocks with their own ordering. That is a separate, careful
-- change. This one is a single ALTER with a one-line rollback.
--
-- ── Why this is believed safe, and where that belief ends ────────────────────
--
-- Logical replication logs, for an UPDATE: the new row in full, plus the old
-- row's replica identity columns to identify it. With FULL the whole old row
-- goes too. Realtime evaluates the RLS policy for an INSERT or UPDATE against
-- the NEW record, which is logged in full either way — so UPDATE and INSERT
-- events should be unaffected.
--
-- DELETE logs only the replica identity columns. The policy here is
-- `can_view_assigned_row(workspace_id, assigned_agent_id)`, and
-- `assigned_agent_id` is nullable so it cannot be in a replica identity index
-- (which must be unique over NOT NULL columns). So after this change, a DELETE
-- event may not reach subscribers who should see it, and a deleted
-- conversation would linger in an open inbox until the page is refreshed.
--
-- That is acceptable here and the reason is measurable: `conversations` has had
-- **0 deletes in 44 days** (pg_stat_user_tables.n_tup_del). The Delete
-- Conversation feature exists, so it is not impossible — just rare, and its
-- failure mode is a stale row until refresh rather than lost data.
--
-- **What is NOT verified from here**: Supabase's `walrus` is a third-party
-- component and the paragraph above is reasoning about its internals, not a
-- reading of it. Migration 047 set FULL precisely because reverting it once
-- "silently drops change events and the inbox stops updating live". If that
-- happens again, run migration 145 — it is instant and changes no data.

-- Unique, NOT NULL, non-partial, non-deferrable: the four things a replica
-- identity index must be. workspace_id leads because it is what every RLS
-- policy and subscription filter starts from.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_replident
  ON public.conversations (workspace_id, id);

ALTER TABLE public.conversations
  REPLICA IDENTITY USING INDEX conversations_replident;

COMMENT ON INDEX public.conversations_replident IS
  'Replica identity for logical replication (migration 144). Dropping this reverts the table to REPLICA IDENTITY NOTHING, which stops Realtime UPDATE/DELETE events — set REPLICA IDENTITY FULL first (migration 145).';

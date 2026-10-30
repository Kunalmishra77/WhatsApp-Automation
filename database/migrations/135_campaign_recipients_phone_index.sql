-- 135 — The inbound path's most expensive lookup had no index.
--
-- Every inbound WhatsApp message asks "is this a reply to a campaign we sent?"
-- twice: once by contact_id, then — when that finds nothing — by phone, because
-- CSV and manual campaigns write recipient rows with no contact_id.
--
-- `campaign_recipients` is indexed on contact_id, campaign_id, conversation_id
-- and whatsapp_msg_id. Not on phone. From pg_stat_statements, since 17 Sept:
--
--   WHERE contact_id = $1 AND workspace_id = $2   14,995 calls   0.1 ms mean
--   WHERE phone      = $1 AND workspace_id = $2   12,089 calls  13.3 ms mean
--                                                  160.6 s total, 2,158 ms max
--
-- The second one is the same question asked a different way, and it runs on 81%
-- of inbound messages — every message from a contact who is not already a known
-- campaign recipient. It costs 133 times as much per call, and it is 160 seconds
-- of database time for answers that are almost all empty.
--
-- Without an index, the planner falls back to idx_cr_workspace and filters.
-- Measured on production against the largest workspace:
--
--   Index Scan using idx_cr_workspace  (actual time=716.854..716.855 rows=0)
--     Filter: (phone = '...')
--     Rows Removed by Filter: 321929
--     Buffers: shared hit=10870
--
-- 717 ms to return nothing. The same query is 22 ms on a workspace with 1,212
-- recipient rows, which is why this stayed hidden: it is invisible until one
-- client's recipient table gets large, and then it is most of the delay before
-- their customer gets a reply.
--
-- (workspace_id, phone) rather than (phone): every read of this table is
-- workspace-scoped, and the leading column keeps the index useful for the
-- workspace-only filters idx_cr_workspace serves today.
--
-- Plain CREATE INDEX, not CONCURRENTLY: run-migration.mjs sends the file as one
-- multi-statement query, which Postgres runs in an implicit transaction, and
-- CONCURRENTLY cannot run inside one. 404k rows is a write lock of seconds.

CREATE INDEX IF NOT EXISTS idx_cr_workspace_phone
  ON public.campaign_recipients (workspace_id, phone);

ANALYZE public.campaign_recipients;

-- Follow-up, deliberately not done here: `idx_cr_workspace` is now redundant —
-- a (workspace_id, phone) index serves a workspace_id-only filter just as well.
-- Dropping it would save its write cost on 404k rows. Left in place until this
-- index is confirmed to be the one the planner picks in production, because
-- dropping the index the current plans depend on is not a change to make blind.

-- ── 056_drop_unused_webhook_index.sql ────────────────────────────────────────
-- The GIN index on whatsapp_webhook_events.meta_message_ids was never queried
-- (0 scans; ~24 MB). Deduplication is now handled in Redis (signature-keyed
-- idempotency, see lib/webhook-idempotency.ts). Drop the dead index. The
-- meta_message_ids column is retained (cheap) to avoid a table rewrite.
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_whatsapp_webhook_events_message_ids;

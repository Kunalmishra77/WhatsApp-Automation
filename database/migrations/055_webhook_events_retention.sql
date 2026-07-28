-- ── 055_webhook_events_retention.sql ─────────────────────────────────────────
-- whatsapp_webhook_events is a raw inbound-webhook processing log (server-only,
-- RLS denies all client access). It is written on every incoming WhatsApp event
-- and never read after processing. Left unmanaged it grew to ~700k rows / ~1 GB
-- (86% of the database) in ~2 months and forced repeated compute upgrades.
--
-- This migration bounds it permanently:
--   1. A daily pg_cron job prunes rows older than 7 days (idempotency + debug
--      window is well under 7 days — Meta retries within hours).
--   2. Autovacuum is tuned aggressively so the daily deletes never re-bloat.
--
-- One-time backfill (already performed in production on 2026-07-28): the 612,357
-- rows older than the 7-day window were archived to Supabase Storage
-- (bucket `db-archives`, verified count match) and then deleted + VACUUM FULL'd,
-- reducing the DB from ~1,168 MB to ~240 MB.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1. Daily prune of webhook events older than 7 days ───────────────────────
SELECT cron.unschedule('prune-webhook-events') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'prune-webhook-events'
);

SELECT cron.schedule(
  'prune-webhook-events',
  '15 3 * * *',   -- daily at 03:15 UTC
  $$DELETE FROM public.whatsapp_webhook_events WHERE received_at < NOW() - INTERVAL '7 days'$$
);

-- ── 2. Aggressive autovacuum so the daily deletes never re-bloat ─────────────
ALTER TABLE public.whatsapp_webhook_events SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay    = 2
);

-- ── Verify ───────────────────────────────────────────────────────────────────
-- SELECT jobname, schedule FROM cron.job WHERE jobname = 'prune-webhook-events';

-- 077_auto_resolve_and_tagging.sql
-- Two "no manual work" automations, both pure-DB (pg_cron), so the analytics
-- Resolved count and Tag Distribution populate + stay fresh on their own.

-- ── 1. Auto-resolve ───────────────────────────────────────────────────────────
-- A conversation with no activity for 3 days is auto-marked resolved. Keeps the
-- inbox from growing unbounded and gives a real Resolved metric (the bot answers
-- and leaves everything 'open' otherwise). Skips spam. Runs every 2 hours.
SELECT cron.unschedule('auto-resolve-conversations')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-resolve-conversations');
SELECT cron.schedule('auto-resolve-conversations', '20 */2 * * *', $$
  UPDATE public.conversations
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE status IN ('open','pending','assigned')
    AND resolved_at IS NULL
    AND last_message_at IS NOT NULL
    AND last_message_at < now() - interval '3 days'
    AND COALESCE(is_spam, false) = false
$$);

-- Backfill immediately so the metric is correct right away.
UPDATE public.conversations
SET status = 'resolved', resolved_at = now(), updated_at = now()
WHERE status IN ('open','pending','assigned')
  AND resolved_at IS NULL
  AND last_message_at IS NOT NULL
  AND last_message_at < now() - interval '3 days'
  AND COALESCE(is_spam, false) = false;

-- ── 2. Auto-tagging ───────────────────────────────────────────────────────────
-- Derive contact tags automatically from their lead signals (temperature, source),
-- VIP flag, and lifecycle stage — so Tag Distribution reflects real segments with
-- zero manual tagging. Set-based; only rewrites contacts whose tags changed.
CREATE OR REPLACE FUNCTION public.sync_contact_tags() RETURNS void LANGUAGE sql AS $$
  WITH agg AS (
    SELECT ct.id AS contact_id,
      array_remove(ARRAY(SELECT DISTINCT unnest(array[
        max(l.temperature),
        CASE WHEN bool_or(l.source = 'meta_ad') THEN 'meta-ad' ELSE 'organic' END,
        CASE WHEN ct.is_vip THEN 'vip' END,
        ct.lifecycle_stage
      ])), NULL) AS tags
    FROM public.contacts ct
    LEFT JOIN public.leads l ON l.contact_id = ct.id
    GROUP BY ct.id, ct.is_vip, ct.lifecycle_stage
  )
  UPDATE public.contacts ct
  SET tags = agg.tags, updated_at = now()
  FROM agg
  WHERE ct.id = agg.contact_id
    AND COALESCE(ct.tags, '{}') IS DISTINCT FROM agg.tags;
$$;

-- Backfill now.
SELECT public.sync_contact_tags();

-- Keep tags fresh every 3 hours (as leads change temperature/stage over time).
SELECT cron.unschedule('sync-contact-tags')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-contact-tags');
SELECT cron.schedule('sync-contact-tags', '40 */3 * * *', $$ SELECT public.sync_contact_tags() $$);

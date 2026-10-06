-- 109_ad_level_attribution.sql
-- Phase 4 Track 1 (fast-follow): per-AD attribution for Click-to-WhatsApp and
-- Instagram ad leads. Until now CTWA ad data lived only inside
-- conversations.meta.ad_source JSON and the touchpoint metadata JSON, so it could
-- not be grouped/aggregated. Promote the key fields to typed, indexable columns on
-- `leads` so "which individual ad produced these leads / conversions / revenue"
-- becomes a simple GROUP BY ad_id.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ad_id       TEXT,   -- Meta ad id (ads_fbid) or IG ad_id
  ADD COLUMN IF NOT EXISTS ad_name     TEXT,   -- ad headline / title (human-readable)
  ADD COLUMN IF NOT EXISTS ad_platform TEXT,   -- 'facebook' | 'instagram'
  ADD COLUMN IF NOT EXISTS ctwa_clid   TEXT;   -- Click-to-WhatsApp click id (dedupe/debug)

-- Per-ad rollups are scoped per workspace and only meaningful where an ad id exists.
CREATE INDEX IF NOT EXISTS idx_leads_ws_ad
  ON public.leads (workspace_id, ad_id)
  WHERE ad_id IS NOT NULL;

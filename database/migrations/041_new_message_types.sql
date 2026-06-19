-- Migration 041: New campaign message types
-- Adds: LTO, Carousel, Interactive List support in templates
--       LTO expiry/coupon, Location, Card media URLs in campaigns

-- ── Templates ────────────────────────────────────────────────────────────────
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS has_lto          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_carousel      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cards            JSONB,
  ADD COLUMN IF NOT EXISTS list_button_text VARCHAR(20),
  ADD COLUMN IF NOT EXISTS list_sections    JSONB;

-- ── Campaigns ────────────────────────────────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS lto_expiry_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lto_coupon_code  VARCHAR(30),
  ADD COLUMN IF NOT EXISTS location_lat     DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS location_lng     DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS location_name    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS location_address VARCHAR(255),
  ADD COLUMN IF NOT EXISTS card_media_urls  JSONB;

-- Migration 025: WhatsApp Catalog
-- Adds catalog_id to workspaces + local products cache table

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS catalog_id TEXT;

CREATE TABLE IF NOT EXISTS catalog_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  catalog_id      TEXT NOT NULL,
  retailer_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  price           TEXT,
  currency        TEXT,
  image_url       TEXT,
  availability    TEXT DEFAULT 'in stock',
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, retailer_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_products_workspace ON catalog_products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_catalog_products_name ON catalog_products USING gin(to_tsvector('english', name));

ALTER TABLE catalog_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_catalog_products" ON catalog_products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = catalog_products.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

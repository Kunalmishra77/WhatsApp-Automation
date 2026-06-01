BEGIN;

CREATE TABLE IF NOT EXISTS public.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  order_ref       VARCHAR(100) NOT NULL,
  status          VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- status: pending, confirmed, processing, shipped, out_for_delivery, delivered, cancelled, refunded
  customer_name   VARCHAR(255),
  items_summary   TEXT,
  total_amount    NUMERIC(12,2),
  currency        VARCHAR(10) DEFAULT 'INR',
  expected_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, order_ref)
);

CREATE INDEX IF NOT EXISTS idx_orders_workspace ON public.orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_orders_contact   ON public.orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_ref       ON public.orders(workspace_id, order_ref);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_workspace" ON public.orders;
CREATE POLICY "orders_workspace" ON public.orders FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;

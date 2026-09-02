-- 084_meta_rates.sql — configurable Meta per-conversation billing rates (INR).
-- Singleton config row, mirrors billing_config (065_billing.sql). Previously hardcoded
-- identically in app/api/admin/meta-billing/route.ts and
-- modules/admin/components/MetaBillingOverview/index.tsx — now a single DB source of
-- truth read via lib/meta-rates.ts and editable from Admin Settings.
CREATE TABLE IF NOT EXISTS public.meta_rates (
  id integer PRIMARY KEY DEFAULT 1,
  marketing numeric(10,4) NOT NULL DEFAULT 0.58,
  utility   numeric(10,4) NOT NULL DEFAULT 0.14,
  auth      numeric(10,4) NOT NULL DEFAULT 0.14,
  service   numeric(10,4) NOT NULL DEFAULT 0.29,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_rates_singleton CHECK (id = 1)
);
-- RLS deny-all (service-role + API only), matches billing_config
ALTER TABLE public.meta_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_rates_no_client ON public.meta_rates;
CREATE POLICY meta_rates_no_client ON public.meta_rates FOR ALL USING (false) WITH CHECK (false);
INSERT INTO public.meta_rates (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

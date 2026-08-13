-- 068_billing_terms.sql — add plan durations (terms) + offers + subscriptions.term.
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'monthly'
    CHECK (term IN ('monthly','quarterly','half_yearly','yearly')),
  ADD COLUMN IF NOT EXISTS months int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS original_total_paise int;   -- null = no offer

-- key is now (key, term); swap the old UNIQUE(key) for UNIQUE(key, term)
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_key_key;
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_key_term_uq;
ALTER TABLE public.billing_plans ADD CONSTRAINT billing_plans_key_term_uq UNIQUE (key, term);

-- Re-seed 8 rows (2 channels x 4 terms). razorpay_plan_id filled at cutover.
DELETE FROM public.billing_plans;
INSERT INTO public.billing_plans (key, term, name, months, base_paise, total_paise, original_total_paise, includes_instagram) VALUES
  ('whatsapp','monthly','WhatsApp — Monthly',1,299900,353882,NULL,false),
  ('whatsapp','quarterly','WhatsApp — Quarterly',3,899700,1061646,NULL,false),
  ('whatsapp','half_yearly','WhatsApp — 6 Months',6,1500000,1770000,2123292,false),
  ('whatsapp','yearly','WhatsApp — 1 Year',12,3000000,3540000,4246584,false),
  ('whatsapp_instagram','monthly','WhatsApp + Instagram — Monthly',1,399800,471764,NULL,true),
  ('whatsapp_instagram','quarterly','WhatsApp + Instagram — Quarterly',3,1199400,1415292,NULL,true),
  ('whatsapp_instagram','half_yearly','WhatsApp + Instagram — 6 Months',6,2000000,2360000,2830584,true),
  ('whatsapp_instagram','yearly','WhatsApp + Instagram — 1 Year',12,4000000,4720000,5661168,true);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'monthly'
    CHECK (term IN ('monthly','quarterly','half_yearly','yearly'));

-- carry the chosen term on the payment (checkout writes it; verify reads it back)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS term text;

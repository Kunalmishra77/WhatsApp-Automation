-- 065_billing.sql — Razorpay subscription billing. FINANCIAL DATA — must NOT be deleted
-- by campaign-retention cleanup.
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL, name text NOT NULL,
  base_paise int NOT NULL, gst_rate numeric(4,2) NOT NULL DEFAULT 18.00,
  total_paise int NOT NULL, razorpay_plan_id text,
  includes_instagram bool NOT NULL DEFAULT false,
  period text NOT NULL DEFAULT 'monthly', active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid UNIQUE NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_key text NOT NULL, mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('auto','manual')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','past_due','suspended','cancelled')),
  has_instagram bool NOT NULL DEFAULT false,
  razorpay_subscription_id text, razorpay_customer_id text,
  current_period_start date, current_period_end date, grace_until date,
  reminder_sent_for date, cancel_at_period_end bool NOT NULL DEFAULT false,
  is_comped bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_rzp ON public.subscriptions(razorpay_subscription_id);
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  razorpay_order_id text, razorpay_payment_id text, razorpay_subscription_id text,
  invoice_no text UNIQUE,
  base_paise int NOT NULL DEFAULT 0, gst_paise int NOT NULL DEFAULT 0, total_paise int NOT NULL DEFAULT 0,
  gst_rate numeric(4,2) NOT NULL DEFAULT 18.00, currency text NOT NULL DEFAULT 'INR',
  method text, status text NOT NULL DEFAULT 'created',   -- created|captured|failed|refunded
  period_start date, period_end date, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_ws ON public.payments(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(razorpay_order_id);
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  event_id text PRIMARY KEY, event_type text, payload jsonb, processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.billing_config (
  id int PRIMARY KEY DEFAULT 1, grace_days int NOT NULL DEFAULT 3,
  reminder_days_before int NOT NULL DEFAULT 3, updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_config_singleton CHECK (id = 1)
);
-- RLS deny-all (service-role + API only)
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT unnest(ARRAY['billing_plans','subscriptions','payments','billing_webhook_events','billing_config']) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_no_client ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_no_client ON public.%I FOR ALL USING (false) WITH CHECK (false);', t, t);
  END LOOP;
END $$;
-- Seed plans (razorpay_plan_id filled at go-live)
INSERT INTO public.billing_plans (key, name, base_paise, total_paise, includes_instagram) VALUES
  ('whatsapp', 'WhatsApp Automation', 299900, 353882, false),
  ('whatsapp_instagram', 'WhatsApp + Instagram', 399800, 471764, true)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.billing_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
-- Daily billing sweep (controller inlines URL + CRON_SECRET at apply, per 063 pattern)
SELECT cron.unschedule('billing-sweep') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='billing-sweep');
SELECT cron.schedule('billing-sweep', '30 4 * * *', $$
  SELECT net.http_post(url := current_setting('app.base_url', true) || '/api/cron/billing-sweep',
    headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
    body := '{}'::jsonb) AS request_id; $$);

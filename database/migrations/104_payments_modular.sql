-- 104_payments_modular.sql
-- Modular checkout: record exactly what a payment was for on the payment row, so
-- verify no longer has to reverse-engineer the plan from base_paise (which breaks
-- once add-on amounts are summed). Additive — legacy payments keep working via the
-- base_paise fallback in the verify route.

alter table public.payments
  add column if not exists plan_key          text,
  add column if not exists has_instagram     boolean not null default false,
  add column if not exists has_google_growth boolean not null default false;

comment on column public.payments.plan_key is 'Base plan this payment activates (core | all_in_one | legacy). Read by verify; base_paise is the fallback.';
comment on column public.payments.has_google_growth is 'Whether this payment includes the Google Growth add-on.';

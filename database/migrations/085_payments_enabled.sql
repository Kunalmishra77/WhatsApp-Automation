-- 085_payments_enabled.sql
-- Global kill-switch for collecting payments. When false, the self-serve
-- onboarding plan step stops asking new signups to pay and activates their
-- workspace for free instead (see /api/onboarding/activate-free). Flipped off
-- while the Razorpay website (app.aiagentixdev.com) is still under review, so
-- clients aren't shown a checkout that fails "Business – Website mismatch".
-- Toggle back to true (super-admin Settings → Billing) once the domain is
-- approved — no redeploy needed, it's read at request time.

alter table billing_config
  add column if not exists payments_enabled boolean not null default true;

comment on column billing_config.payments_enabled is
  'When false, self-serve onboarding skips checkout and activates workspaces free (comped). Set false while the Razorpay website is unverified.';

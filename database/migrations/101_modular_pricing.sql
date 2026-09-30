-- 101_modular_pricing.sql
-- Self-serve pivot: modular ₹4999 pricing + 3-day trial scaffolding. ADDITIVE —
-- existing plans (whatsapp, whatsapp_instagram) and comped subscriptions are left
-- untouched. Base prices are pre-GST (18% added at checkout, same as migration 065).

-- Distinguish base plans from add-ons.
alter table public.billing_plans add column if not exists kind text not null default 'plan';

-- Add-on entitlement flags on a subscription (has_instagram already exists).
alter table public.subscriptions add column if not exists has_google_growth boolean not null default false;

-- 3-day trial: when the trial ends. Null = not on a trial.
alter table public.workspaces add column if not exists trial_ends_at timestamptz;

-- New modular plans + add-ons. base_paise pre-GST; total_paise = base * 1.18.
insert into public.billing_plans (key, name, base_paise, total_paise, includes_instagram, kind)
select v.key, v.name, v.base_paise, v.total_paise, v.includes_instagram, v.kind
from (values
  ('core',                'Core (WhatsApp)',        299900, 353882, false, 'plan'),
  ('all_in_one',          'All-in-One',             499900, 589882, true,  'plan'),
  ('instagram_addon',     'Instagram Automation',    99900, 117882, true,  'addon'),
  ('google_growth_addon', 'Google Growth',           99900, 117882, false, 'addon')
) as v(key, name, base_paise, total_paise, includes_instagram, kind)
where not exists (select 1 from public.billing_plans b where b.key = v.key);

comment on column public.billing_plans.kind is 'plan = a base subscription plan; addon = an optional module added on top of Core.';
comment on column public.subscriptions.has_google_growth is 'Google Growth add-on (GBP + Google Ads + Local Rank + reviews) entitlement.';
comment on column public.workspaces.trial_ends_at is '3-day self-serve trial expiry; null when not trialing.';

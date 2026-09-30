-- 102_modular_plan_terms.sql
-- Seed the new modular plans + add-ons across all four billing terms so checkout
-- and the billing sweep can resolve any (key, term). base_paise pre-GST; total =
-- base * 1.18. Longer terms carry a discount (original_total_paise = undiscounted).
-- Idempotent via the (key, term) unique constraint.

insert into public.billing_plans (key, term, name, months, base_paise, total_paise, original_total_paise, includes_instagram, kind) values
  -- Core (WhatsApp) — same price as the legacy whatsapp plan
  ('core','quarterly',   'Core — Quarterly',   3,  899700, 1061646, NULL,    false, 'plan'),
  ('core','half_yearly', 'Core — 6 Months',    6, 1500000, 1770000, 2123292, false, 'plan'),
  ('core','yearly',      'Core — 1 Year',      12, 3000000, 3540000, 4246584, false, 'plan'),
  -- All-in-One (everything) — ₹4999/mo base
  ('all_in_one','quarterly',   'All-in-One — Quarterly', 3, 1499700, 1769646, NULL,    true, 'plan'),
  ('all_in_one','half_yearly', 'All-in-One — 6 Months',  6, 2500000, 2950000, 3539292, true, 'plan'),
  ('all_in_one','yearly',      'All-in-One — 1 Year',   12, 4999000, 5898820, 7078584, true, 'plan'),
  -- Instagram add-on
  ('instagram_addon','quarterly',   'Instagram Automation — Quarterly', 3, 299700, 353646, NULL,   true, 'addon'),
  ('instagram_addon','half_yearly', 'Instagram Automation — 6 Months',  6, 500000, 590000, 707292, true, 'addon'),
  ('instagram_addon','yearly',      'Instagram Automation — 1 Year',   12, 999000, 1178820, 1414584, true, 'addon'),
  -- Google Growth add-on
  ('google_growth_addon','quarterly',   'Google Growth — Quarterly', 3, 299700, 353646, NULL,   false, 'addon'),
  ('google_growth_addon','half_yearly', 'Google Growth — 6 Months',  6, 500000, 590000, 707292, false, 'addon'),
  ('google_growth_addon','yearly',      'Google Growth — 1 Year',   12, 999000, 1178820, 1414584, false, 'addon')
on conflict (key, term) do nothing;

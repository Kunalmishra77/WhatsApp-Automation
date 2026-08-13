# Billing v2 — Plan Durations, Offers & Countdown

**Date:** 2026-08-13
**Status:** Approved design pending user review, then implementation plan
**Extends:** Project 1 (Razorpay subscription billing, already shipped monthly-only)

## Problem

The shipped billing supports **monthly only**. We need clients to buy **monthly, quarterly
(3mo), half-yearly (6mo), or yearly (12mo)** in one go, with **offers on 6mo/1yr** shown as a
struck-through original price. Clients also need a visible **countdown** — "X days left in your
plan", switching to **hours** in the final day. The lifecycle (reminders, grace, suspend) stays
the same; only the period length and price vary by term.

## Decisions (confirmed)

1. **Four terms:** monthly (1), quarterly (3), half-yearly (6), yearly (12) months.
2. **Pricing** (base → +18% GST = client pays; offers list the struck original = months ×
   monthly-total):

   | Term | WhatsApp base / pays | +Instagram (combined) base / pays | Original (struck, GST-incl) |
   |---|---|---|---|
   | Monthly | ₹2,999 → **₹3,538.82** | ₹3,998 → **₹4,717.64** | — |
   | Quarterly | ₹8,997 → **₹10,616.46** | ₹11,994 → **₹14,152.92** | — (same rate, no offer) |
   | 6 months | ₹15,000 → **₹17,700** | ₹20,000 → **₹23,600** | WA ₹21,232.92 · combo ₹28,305.84 |
   | 1 year | ₹30,000 → **₹35,400** | ₹40,000 → **₹47,200** | WA ₹42,465.84 · combo ₹56,611.68 |

   Instagram add-on offers rounded so combined bases are clean (₹20,000 / ₹40,000); discount
   ≈16.6% (same as WhatsApp). **All amounts in paise.** `original_total_paise = months ×
   monthly_total_paise` (null when no offer).
3. **Offers always show the original price struck through** (from `original_total_paise`);
   monthly/quarterly show no strikethrough.
4. **Countdown** on the client billing page: days left from `current_period_end`; **< 1 day →
   hours left**; past end → "expired". Timezone IST.
5. **Lifecycle unchanged:** reminder 3 days before `current_period_end`, grace, then suspend —
   regardless of term. The sweep + guard already use `current_period_end` generically; **no
   change needed there.**
6. Auto-pay: each (channel, term) gets its own **Razorpay plan** (period/interval below), so the
   mandate auto-renews per term. Manual recharge: order amount = the term total; `period_end =
   today + months`.

## Data model (migration 068 — restructure billing_plans, add subscriptions.term)

**`billing_plans`** gains a term dimension. Add columns and re-seed to **8 rows** (2 channels ×
4 terms):
```
ALTER TABLE billing_plans
  ADD COLUMN term text NOT NULL DEFAULT 'monthly'
    CHECK (term IN ('monthly','quarterly','half_yearly','yearly')),
  ADD COLUMN months int NOT NULL DEFAULT 1,
  ADD COLUMN original_total_paise int;         -- null = no offer (no strikethrough)
-- key is now (channel_key, term); replace the UNIQUE(key)
ALTER TABLE billing_plans DROP CONSTRAINT billing_plans_key_key;   -- old unique on key
ALTER TABLE billing_plans ADD CONSTRAINT billing_plans_key_term_uq UNIQUE (key, term);
```
Re-seed (delete the 2 monthly rows, insert 8): each row `(key, term, name, months, base_paise,
total_paise, original_total_paise, includes_instagram, razorpay_plan_id NULL)`. `key` stays
`'whatsapp'` / `'whatsapp_instagram'` (the channel); `term` distinguishes the row. Seed values
from the table above (paise). `razorpay_plan_id` filled at cutover (per-term Razorpay plans).

**`subscriptions`** gains the chosen term:
```
ALTER TABLE subscriptions ADD COLUMN term text NOT NULL DEFAULT 'monthly'
  CHECK (term IN ('monthly','quarterly','half_yearly','yearly'));
```
`plan_key` stays the channel; `(plan_key, term)` selects the billing_plans row. Existing/seeded
clients default to `monthly`.

**Razorpay plan periods** (for the cutover script that creates the 8 plans):
`monthly` → period `monthly` interval 1; `quarterly` → `monthly`/3; `half_yearly` → `monthly`/6;
`yearly` → `yearly`/1. Amount = that row's `total_paise`.

## Helpers (`lib/billing.ts` additions)

- `TERMS: Record<Term,{months:number,label:string}>` = monthly(1)/quarterly(3)/half_yearly(6)/
  yearly(12); `type Term = 'monthly'|'quarterly'|'half_yearly'|'yearly'`.
- `addMonths(dateStr, n): string` — generalizes `addOneMonth` (calendar months, end-of-month
  clamp, year rollover). `addOneMonth` becomes `addMonths(d,1)`.
- `monthsForTerm(term): number`.
- `timeLeft(periodEnd: string, now: Date, tz='Asia/Kolkata'): { expired: boolean; days: number;
  hours: number; label: string }` — pure. `label`: "X days left" (≥1 day), "X hours left"
  (<1 day, ≥0), "Expired" (past). Used by the countdown UI. Unit-tested.
- `computeAmounts`, `verify*Signature`, `nextBillingAction` unchanged (nextBillingAction already
  term-agnostic — it works off `currentPeriodEnd`).

## Checkout / verify (extend Task-4 routes)

`POST /api/billing/checkout` body gains `term` (`monthly|quarterly|half_yearly|yearly`, default
monthly). Resolve the plan by `(planKeyFor(has_instagram), term)`. Manual: order for that
`total_paise`; the `payments` row + `subscriptions` row set `term`, `current_period_end =
addMonths(today, months)`. Auto: subscription on that row's `razorpay_plan_id` (503 if null).
`verify` unchanged except it reads `term`/`months` from the resolved plan/period. Amounts still
from the DB, never the client. Signature + cross-tenant guards unchanged.

The webhook's `subscription.charged` period extension uses the subscription's `term` months
(`addMonths(current_period_end or today, months)`), and the payment amount comes from the
`(plan_key, term)` billing_plans row.

## Client billing UI (extend Task-8 `BillingSettings`)

- **Term selector**: four options (Monthly / Quarterly / 6 Months / 1 Year). Each shows the
  **pay** amount (GST-inclusive) and, when `original_total_paise` is set, the **struck original**
  + a "Save ₹X" badge. Instagram toggle recomputes across terms.
- **Countdown card**: `timeLeft(current_period_end)` → "X days left" / "X hours left" / "Expired",
  with the next-billing date. Prominent when < 3 days.
- Pay Now / auto-pay pass the chosen `term` to checkout.
- `GET /api/billing/status` returns the full price matrix (all terms for the current channel with
  pay + original) so the selector renders without extra calls, plus the active subscription's
  `term` + `current_period_end` for the countdown.

## Super-admin (small MRR refinement)

MRR should be **monthly-normalized**: an active sub contributes `total_paise / months` to MRR
(a yearly ₹35,400 sub = ₹2,950/mo-equivalent), so mixed-term revenue is comparable. Keep the
uncapped/currency-grouped approach. Add a "term mix" count (how many on each term) to the admin
billing view. (Lifetime captured revenue stays actual sum.)

## Security / tenant / retention

No change to RLS (billing_plans stays deny-all; the price matrix is served through the
permission-gated status route, not read client-side directly). Every query workspace-scoped.
Financial tables still retention-excluded. New Razorpay plans created server-side with the
existing keys.

## Testing

- **Unit** (`lib/billing.ts`): `addMonths` (n=1/3/6/12, month-end clamp, year rollover);
  `timeLeft` (>1 day → days; <1 day → hours; exactly 0 / past → expired; IST boundary);
  `monthsForTerm`; term validation. GST/state-machine tests unchanged.
- **Live** (controller): apply migration 068; create the 8 Razorpay term-plans (test keys),
  record `razorpay_plan_id`; webhook E2E per term (charged extends by the right #months); a
  manual-term order sets the right `period_end`; countdown math against a real `current_period_end`.
- **Security**: cross-tenant checkout with someone else's workspace → 403; price always from DB.

## Rollout

Migration 068 (additive columns + re-seed + subscriptions.term) applied live by the controller;
create the 8 test-mode Razorpay plans + record ids; code (helpers + checkout + UI + admin)
requires redeploy. Backward-safe: default `term='monthly'` preserves current behavior for any
existing row. **Existing-client seeding still deferred to the user's explicit "seed now"** (they
seed as `monthly`, 1-Aug anchor).

## Out of scope

Dashboard rebuild (Project 2, deferred). Proration on mid-term plan/term changes beyond
Razorpay's native behavior. Per-term IG-only purchase (IG remains an add-on to a WhatsApp term).

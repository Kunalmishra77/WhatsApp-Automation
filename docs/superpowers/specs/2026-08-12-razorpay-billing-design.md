# Razorpay Subscription Billing (Project 1)

**Date:** 2026-08-12
**Status:** Approved design pending user review, then implementation plan
**Part of:** Platform-Wide Product/Billing/Analytics Overhaul (Project 1 of 5)

## Problem

Clients use the platform for free; there is no working billing. An unfinished Razorpay
*subscription* skeleton exists but is disconnected (checkout writes `stripe_subscription_id`,
webhook reads `razorpay_subscription_id`), has no `plans` table, no webhook idempotency, no
grace/dunning, and — critically — `is_active` is enforced only in the dashboard layout, not at
the API/webhook/cron layer. We are building real recurring billing: one plan **WhatsApp
₹2,999/mo** + optional **Instagram ₹999/mo** add-on, **+18% GST**, with **auto-pay optional /
manual recharge default**, a **grace period then pause**, recharge-style reminders, self-serve
checkout, and super-admin revenue visibility — without ever deleting client data on suspension.

## Verified Razorpay facts (do not re-derive — see research brief)

- **Plans** are immutable; created via API/Dashboard with `period`/`interval`/`item.amount`
  (paise)/`item.currency`. **Subscriptions** (`POST /v1/subscriptions`, `plan_id`, `total_count`)
  authorize a mandate via Checkout with `subscription_id` (UPI AutoPay or card e-mandate), then
  auto-charge at each cycle start. Our price (≈₹3,539–₹4,718) is under the ₹15,000 AFA threshold,
  so recurring debits need no PIN after the one-time mandate setup.
- **Add-on modeling:** use **two Razorpay plans** — "WhatsApp" and "WhatsApp+Instagram bundle" —
  and `PATCH /v1/subscriptions/:id` to switch when IG is added/removed (the Add-ons endpoint is
  possibly deprecated — avoid). For manual mode, the Order amount is the bundle-or-solo total.
- **GST:** Razorpay has no "add tax on top" field. **Bake 18% into every `item.amount`/Order
  `amount`.** Keep our own `base/gst/total` ledger for invoices.
- **Manual one-time:** `POST /v1/orders` (amount paise) → Checkout → verify
  `razorpay_signature == HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)` server-side.
- **Webhooks:** header `X-Razorpay-Signature = HMAC_SHA256(raw_body, WEBHOOK_SECRET)` (webhook
  secret ≠ key secret). Idempotency key = the **`x-razorpay-event-id` header** (no stable body id).
  Events: `subscription.authenticated|activated|charged|pending|halted|cancelled|completed`,
  `payment.captured|failed`, `order.paid`, `refund.processed`.
- **Dependency (must confirm with the account):** Subscriptions may need separate enablement
  beyond KYC, and the Card/UPI/eMandate methods are enabled via Razorpay support. Test mode has a
  "Charge this now" button to simulate cycles.

## Decisions

1. **Extend + harden the existing skeleton**, don't rebuild. Fix the `stripe_subscription_id`
   disconnect (standardize on `razorpay_subscription_id`); route secrets through
   `getRequiredSecret`; switch the webhook's inline emailer to `lib/mailer.ts`.
2. **One plan, everything included.** Remove tier feature-gating (`hasFeature(plan,…)` for
   CRM/Flows). The ₹2,999 plan unlocks all WhatsApp features; the ₹999 add-on toggles the
   Instagram inbox only.
3. **Two payment modes:** auto-pay (Razorpay Subscriptions, opt-in) and manual recharge (Orders,
   default). A workspace has exactly one billing subscription row; `mode` is `auto|manual`.
4. **State machine with grace:** `active → past_due → (grace) → suspended`, plus `cancelled`.
   Grace length is super-admin-configurable (default **3 days**). Data is never deleted on
   suspension.
5. **Existing clients:** seeded `mode=manual, status=active, current_period_start=2026-08-01,
   current_period_end=2026-09-01`. The cron then handles the 3-days-before reminder (~29 Aug),
   grace after 1 Sep, and suspend (~4 Sep) if unpaid. Super-admin can comp/waive any client.
6. **GST 18% on top**, baked into Razorpay amounts, itemized in our records and on invoices.
7. **Enforce billing state at the API layer**, not just the dashboard — a shared guard.

## Pricing (paise, GST-inclusive)

| Item | Base | GST 18% | Total | Razorpay plan |
|---|---|---|---|---|
| WhatsApp | ₹2,999.00 (299900) | ₹539.82 (53982) | **₹3,538.82 (353882)** | Plan A |
| WhatsApp + Instagram | ₹3,998.00 (399800) | ₹719.64 (71964) | **₹4,717.64 (471764)** | Plan B |
| (Instagram add-on, derived) | ₹999.00 | ₹179.82 | ₹1,178.82 | — |

Amounts live in the `billing_plans` table (below), not hardcoded, so a price change is a data +
new-Razorpay-plan change, not a redeploy of constants.

## Data model (migration 065)

**`billing_plans`** — single source of truth (replaces the 3 hardcoded plan objects):
```
id uuid pk, key text unique,           -- 'whatsapp' | 'whatsapp_instagram'
name text, base_paise int, gst_rate numeric(4,2) default 18.00,
total_paise int, razorpay_plan_id text, includes_instagram bool,
period text default 'monthly', active bool default true, created_at timestamptz
```
Seeded with the two rows above (razorpay_plan_id filled at go-live once plans exist in Razorpay).

**`subscriptions`** — one active row per workspace (the billing state of record):
```
id uuid pk, workspace_id uuid unique fk→workspaces on delete cascade,
plan_key text fk→billing_plans.key, mode text check(auto|manual) default 'manual',
status text check(active|past_due|suspended|cancelled) default 'active',
has_instagram bool default false,
razorpay_subscription_id text,          -- null for manual
razorpay_customer_id text,
current_period_start date, current_period_end date,   -- paid-through
grace_until date,                        -- set when entering past_due
reminder_sent_for date,                  -- dedupe the 3-day reminder per cycle
cancel_at_period_end bool default false,
is_comped bool default false,            -- super-admin free waiver
created_at, updated_at timestamptz
```
RLS deny-all (service-role + API only).

**`payments`** — immutable financial ledger (one row per successful charge / invoice):
```
id uuid pk, workspace_id uuid fk, subscription_id uuid fk,
razorpay_order_id text, razorpay_payment_id text, razorpay_subscription_id text,
invoice_no text unique,                  -- our sequential number, e.g. 'INV-2026-000123'
base_paise int, gst_paise int, total_paise int, currency text default 'INR',
gst_rate numeric(4,2), method text,      -- upi|card|... from Razorpay
status text,                             -- captured|failed|refunded
period_start date, period_end date, paid_at timestamptz, created_at timestamptz
```
RLS deny-all. **Financial record — excluded from campaign-retention cleanup** (like meta_spend).

**`billing_webhook_events`** — idempotency:
```
event_id text pk,                        -- x-razorpay-event-id header
event_type text, payload jsonb, processed_at timestamptz default now()
```

**`billing_config`** — super-admin knobs (single row):
```
id int pk default 1, grace_days int default 3,
reminder_days_before int default 3, updated_at timestamptz
```

**Workspaces:** reuse existing `is_active`, `subscription_status`, `razorpay_subscription_id`,
`next_billing_date`, `payment_failed_at`. `subscription_status` values align to the state machine
(`active|past_due|suspended|cancelled`). Keep the separate `pending_approval` semantics distinct
(new self-serve clients no longer default to pending_approval — see §checkout).

## State machine

```
          signup + first payment
                 │
                 ▼
   ┌────────► ACTIVE ──────────── cancel ─────────► CANCELLED
   │           │  (is_active=true)                  (is_active=false)
   │  payment  │ period_end passes / charge fails
   │  success  ▼
   │        PAST_DUE  (is_active=true, grace banner, daily nudge)
   │           │ grace_until passes unpaid / subscription.halted
   │           ▼
   └──────── SUSPENDED  (is_active=false → /payment-required, data preserved)
```
- **ACTIVE**: within paid period. Full access.
- **PAST_DUE**: `now ≥ current_period_end` and unpaid, within `grace_until`. Access retained,
  banner + "Pay Now". Auto-pay: entered on `subscription.pending`.
- **SUSPENDED**: `now ≥ grace_until` unpaid, or `subscription.halted`. `is_active=false`,
  `subscription_status='suspended'` → dashboard redirects to `/payment-required`. **Data kept.**
- **CANCELLED**: user/admin cancelled. Access ends at period end (or immediately if already past).
- Reactivation: any successful payment (manual Order verified, or `subscription.charged`) →
  ACTIVE, `is_active=true`, extend `current_period_end` by one month, clear grace.

## Checkout (self-serve)

New client: signup → **/billing/checkout** (choose WhatsApp, toggle Instagram, choose auto-pay or
pay-once) → pay → webhook/verify activates → dashboard. No mandatory manual admin approval
(super-admin retains a manual-suspend/comp control).

- **Manual (default):** `POST /api/billing/checkout` `{ has_instagram, mode:'manual' }` → create
  Razorpay **Order** for the plan `total_paise` → return `order_id`+`key_id` → Razorpay Checkout →
  on success `POST /api/billing/verify` verifies the signature server-side → create `payments`
  row + `subscriptions` row (or extend) + set `is_active=true`, period = today..+1 month.
  Confirmed independently by the `order.paid`/`payment.captured` webhook (defense in depth).
- **Auto-pay:** `{ mode:'auto' }` → create Razorpay **Subscription** on Plan A/B (by
  `has_instagram`), `total_count` large → Checkout with `subscription_id` (mandate auth) →
  `subscription.activated`/`subscription.charged` webhooks activate + set period.
- **Add/remove Instagram:** auto → `PATCH` subscription to the other plan (Razorpay handles
  proration at next cycle); manual → reflected in the next Order amount. `has_instagram` gates the
  Instagram inbox feature.

## Billing cron (pg_cron daily, inlined secret)

`POST /api/cron/billing-sweep` (Bearer `CRON_SECRET`). For each non-comped subscription:
1. **Reminder:** if `today ≥ current_period_end − reminder_days_before` and
   `reminder_sent_for ≠ current_period_end` → email + in-app "recharge" reminder; stamp
   `reminder_sent_for`.
2. **Enter grace:** if `today ≥ current_period_end` and `status=active` → `status=past_due`,
   `grace_until = current_period_end + grace_days`, notify "payment overdue".
3. **Suspend:** if `today ≥ grace_until` and `status=past_due` → `status=suspended`,
   `is_active=false`, send "subscription ended — pay to restart".
Auto-pay recurring success/failure is primarily webhook-driven; the cron is the safety net + the
manual-mode driver + the reminder engine. Idempotent (date-stamped guards), per-workspace
try/catch. Follows the `063_meta_spend` inlined-URL+secret pg_cron pattern.

## API-layer suspension enforcement (the security fix)

New `lib/billing-guard.ts`: `getBillingState(db, workspaceId)` + `assertWorkspaceActive(...)`
(throws a typed `SuspendedError`). Apply to the **action/write paths a suspended tenant must not
use**: outbound message send (`app/api/messages/send`), campaign run/enqueue + the campaign cron,
and AI auto-reply generation in the inbound webhook (inbound messages are still *recorded* — data
preserved — but no automated send/AI while suspended). The dashboard layout guard stays; add a
**past-due banner** for `is_active=true && status=past_due`. Read-only viewing during suspension is
limited to the `/payment-required` reactivation screen (existing).

## Client billing page

Extend `modules/settings/components/BillingSettings`: current plan + status
(Active/Past Due/Suspended/Cancelled), monthly amount **with GST broken out**, Instagram add-on
toggle, next billing date, payment mode (auto-pay on/off with "set up auto-pay"), **Pay Now**
(manual), and **billing history** (from `payments`, with downloadable invoice numbers). Uses the
Project-0 date utilities for any date display.

## Super-admin billing views

Extend the admin area: **MRR** (sum of active `total_paise`), active/past_due/suspended counts,
add-on (Instagram) revenue, payment history, failed/overdue list, and a **grace-days** config
(writes `billing_config`). A light **reconciliation** view: subscriptions whose Razorpay state
(last webhook) disagrees with our status. Strictly `is_platform_admin`; introduce a shared
`requirePlatformAdmin()` helper (replaces the ~15 duplicated checks). No client financial data to
non-admins.

## Security

- All secret ops server-side; `KEY_ID/KEY_SECRET/WEBHOOK_SECRET` via `getRequiredSecret`.
- Verify the **payment signature** (manual) and **webhook signature** (all events) server-side,
  always; re-derive `order_id` from our DB, never trust client values.
- **Idempotent webhooks** via `billing_webhook_events(event_id)` unique insert — process once.
- Financial tables RLS deny-all; every query workspace-scoped; cross-tenant activation impossible
  (map Razorpay ids → workspace via our rows, verify amount + workspace).
- New billing tables excluded from retention cleanup.

## Testing

- **Unit:** GST math (base→gst→total paise, rounding); plan/amount selection by `has_instagram`;
  state-machine transitions (active→past_due→suspended→reactivate; grace math with configurable
  days); invoice-number generation; webhook signature + payment signature verification (HMAC
  vectors); idempotency (same `event_id` twice → one effect); existing-client seeding (1-Aug
  anchor).
- **Integration (test-mode Razorpay):** manual Order → verify → activation; auto-pay subscription
  → authenticated/activated/charged → period extends; `pending`→past_due; `halted`→suspended;
  duplicate webhook ignored.
- **Security:** cross-tenant activation blocked; suspended workspace's send/campaign/AI-reply
  blocked while inbound still recorded; financial tables not client-readable.
- **E2E:** signup → choose WhatsApp (+IG) → pay (GST shown) → active → suspend on non-payment →
  pay-to-reactivate.

## Rollout & dependencies

Additive migrations (065 billing tables + cron) applied live. **External prerequisites (user):**
(1) confirm Razorpay **Subscriptions** is enabled on the account + UPI AutoPay/card methods on;
(2) create the two Plans in Razorpay (or we create via API) and record their `razorpay_plan_id`
into `billing_plans`; (3) set `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` + the webhook endpoint
(`/api/billing/razorpay-webhook`) with the listed events in the Razorpay Dashboard; (4) GST
registration number for invoices (if itemized GSTIN required). The whole system is built and
reviewed against **test-mode** keys; the live cutover (real keys + plan ids + existing-client
seeding) is a final controller step. Feature-gating removal and the API-layer guard ship together
so no client is half-billed.

## Out of scope (later projects)

Dashboard rebuild (P2), conversation filtering (P3), UX redesign (P4). Instagram remains a 1:1
inbox add-on (no IG campaigns). No proration UI beyond Razorpay's native plan-switch behavior.

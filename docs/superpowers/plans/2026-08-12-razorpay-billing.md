# Razorpay Subscription Billing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real recurring billing — one plan (WhatsApp ₹2,999) + Instagram add-on (₹999) + 18% GST, auto-pay optional / manual recharge default, grace-then-pause lifecycle, self-serve checkout, super-admin revenue views — without deleting client data on suspension.

**Architecture:** Pure helpers (GST/state-machine/signatures) → billing tables (migration 065) → a hardened Razorpay REST client → checkout/verify + idempotent signature-verified webhook driving a state machine → an API-layer suspension guard + one-plan de-gating → a daily billing-sweep cron → client billing UI → super-admin views. Built/reviewed against Razorpay **test mode**; live keys + plan ids + existing-client seeding are the final cutover step.

**Tech Stack:** Next.js 15 route handlers, Supabase Postgres (RLS deny-all + service-role), TypeScript, Vitest, Node `crypto` (HMAC), pg_cron, recharts, Tailwind. Razorpay via `fetch` (no SDK).

## Global Constraints

- **Money in paise (integer).** GST = `Math.round(basePaise * 0.18)`; `total = base + gst`. Prices: WhatsApp base `299900` → total `353882`; WhatsApp+Instagram base `399800` → total `471764`. These live in `billing_plans`, never hardcoded in routes.
- **All secret ops server-side.** `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` read via `getRequiredSecret` (`lib/supabase-env.ts`, BOM/whitespace-clean). Never sent to the client except `KEY_ID` (public by design).
- **Verify every signature server-side.** Payment: `HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)`. Webhook: `HMAC_SHA256(raw_body, WEBHOOK_SECRET)` vs `X-Razorpay-Signature`. Use `crypto.timingSafeEqual`.
- **Idempotent webhooks** via unique insert on `billing_webhook_events.event_id` (the `x-razorpay-event-id` header) — process once, else 200.
- **Never delete client data on suspension.** Suspend = `is_active=false` + `subscription_status='suspended'`; data preserved. New billing tables are financial records — excluded from retention cleanup.
- **Tenant safety:** financial tables RLS deny-all; every query workspace-scoped; resolve Razorpay ids → workspace only via our own rows / `notes.workspace_id`; verify amount + workspace before activating.
- **Auth:** client billing routes use `requireWorkspacePermission(workspaceId,'billing_management')`; admin routes use the new `requirePlatformAdmin()`.
- Windows: Bash tool for `npx tsc --noEmit`, `npx vitest run`, `git`. Do NOT run `npx next build`. Razorpay live calls aren't possible without keys — money/crypto logic is unit-tested; live integration is a cutover step.

---

### Task 1: `lib/billing.ts` — pure billing helpers + tests

**Files:** Create `lib/billing.ts`; Test `tests/billing.test.ts`.

**Interfaces (Produces):**
- `GST_RATE = 18`
- `PLAN_KEYS = { WHATSAPP: 'whatsapp', WHATSAPP_INSTAGRAM: 'whatsapp_instagram' } as const`; `type PlanKey = 'whatsapp'|'whatsapp_instagram'`
- `planKeyFor(hasInstagram: boolean): PlanKey`
- `computeAmounts(basePaise: number): { basePaise: number; gstPaise: number; totalPaise: number }`
- `type SubStatus = 'pending'|'active'|'past_due'|'suspended'|'cancelled'`
- `addOneMonth(dateStr: string): string` (YYYY-MM-DD; calendar month, clamps end-of-month)
- `formatInvoiceNo(seq: number, year: number): string` → `INV-<year>-<6-digit seq>`
- `rupees(paise: number): string` → `'3,538.82'` (en-IN, 2dp)
- `nextBillingAction(input: { status: SubStatus; currentPeriodEnd: string; graceUntil: string|null; today: string; graceDays: number; reminderDaysBefore: number; reminderSentFor: string|null }): { action: 'none'|'send_reminder'|'enter_grace'|'suspend'; status: SubStatus; isActive: boolean; graceUntil: string|null; reminderSentFor: string|null }`
- `verifyPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean`
- `verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean`

- [ ] **Step 1: Write failing tests**

```ts
// tests/billing.test.ts
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { computeAmounts, planKeyFor, addOneMonth, formatInvoiceNo, rupees,
  nextBillingAction, verifyPaymentSignature, verifyWebhookSignature } from '@/lib/billing';

describe('GST math', () => {
  it('WhatsApp base 299900 → gst 53982, total 353882', () => {
    expect(computeAmounts(299900)).toEqual({ basePaise: 299900, gstPaise: 53982, totalPaise: 353882 });
  });
  it('bundle base 399800 → gst 71964, total 471764', () => {
    expect(computeAmounts(399800)).toEqual({ basePaise: 399800, gstPaise: 71964, totalPaise: 471764 });
  });
});
describe('plan selection', () => {
  it('maps instagram flag', () => {
    expect(planKeyFor(false)).toBe('whatsapp');
    expect(planKeyFor(true)).toBe('whatsapp_instagram');
  });
});
describe('dates + invoice + display', () => {
  it('addOneMonth normal + month-end clamp', () => {
    expect(addOneMonth('2026-08-01')).toBe('2026-09-01');
    expect(addOneMonth('2026-01-31')).toBe('2026-02-28');
  });
  it('invoice number format', () => {
    expect(formatInvoiceNo(123, 2026)).toBe('INV-2026-000123');
  });
  it('rupees', () => { expect(rupees(353882)).toBe('3,538.82'); });
});
describe('state machine (grace 3, reminder 3)', () => {
  const base = { graceDays: 3, reminderDaysBefore: 3 };
  it('sends reminder 3 days before end', () => {
    const r = nextBillingAction({ ...base, status: 'active', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-08-29', reminderSentFor: null });
    expect(r.action).toBe('send_reminder'); expect(r.reminderSentFor).toBe('2026-09-01'); expect(r.isActive).toBe(true);
  });
  it('does not resend reminder for same cycle', () => {
    const r = nextBillingAction({ ...base, status: 'active', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-08-30', reminderSentFor: '2026-09-01' });
    expect(r.action).toBe('none');
  });
  it('enters grace at period end', () => {
    const r = nextBillingAction({ ...base, status: 'active', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-09-01', reminderSentFor: '2026-09-01' });
    expect(r.action).toBe('enter_grace'); expect(r.status).toBe('past_due'); expect(r.graceUntil).toBe('2026-09-04'); expect(r.isActive).toBe(true);
  });
  it('suspends after grace', () => {
    const r = nextBillingAction({ ...base, status: 'past_due', currentPeriodEnd: '2026-09-01', graceUntil: '2026-09-04', today: '2026-09-04', reminderSentFor: '2026-09-01' });
    expect(r.action).toBe('suspend'); expect(r.status).toBe('suspended'); expect(r.isActive).toBe(false);
  });
  it('active mid-cycle → none', () => {
    const r = nextBillingAction({ ...base, status: 'active', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-08-15', reminderSentFor: null });
    expect(r.action).toBe('none'); expect(r.isActive).toBe(true);
  });
});
describe('signatures', () => {
  const secret = 'testsecret';
  it('payment signature verifies', () => {
    const sig = crypto.createHmac('sha256', secret).update('order_1|pay_1').digest('hex');
    expect(verifyPaymentSignature('order_1', 'pay_1', sig, secret)).toBe(true);
    expect(verifyPaymentSignature('order_1', 'pay_1', 'deadbeef', secret)).toBe(false);
  });
  it('webhook signature verifies over raw body', () => {
    const body = '{"event":"subscription.charged"}';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body, sig + '00', secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify fail** — `npx vitest run tests/billing.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/billing.ts`.** Key logic:

```ts
import crypto from 'node:crypto';
export const GST_RATE = 18;
export const PLAN_KEYS = { WHATSAPP: 'whatsapp', WHATSAPP_INSTAGRAM: 'whatsapp_instagram' } as const;
export type PlanKey = typeof PLAN_KEYS[keyof typeof PLAN_KEYS];
export type SubStatus = 'pending'|'active'|'past_due'|'suspended'|'cancelled';

export function planKeyFor(hasInstagram: boolean): PlanKey {
  return hasInstagram ? PLAN_KEYS.WHATSAPP_INSTAGRAM : PLAN_KEYS.WHATSAPP;
}
export function computeAmounts(basePaise: number) {
  const gstPaise = Math.round(basePaise * GST_RATE / 100);
  return { basePaise, gstPaise, totalPaise: basePaise + gstPaise };
}
export function addOneMonth(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const firstNext = new Date(Date.UTC(y, m, 1)); // month m (0-based m = next month)
  const lastDayNext = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  firstNext.setUTCDate(Math.min(d, lastDayNext));
  return firstNext.toISOString().slice(0, 10);
}
export function formatInvoiceNo(seq: number, year: number): string {
  return `INV-${year}-${String(seq).padStart(6, '0')}`;
}
export function rupees(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function nextBillingAction(i: {
  status: SubStatus; currentPeriodEnd: string; graceUntil: string|null; today: string;
  graceDays: number; reminderDaysBefore: number; reminderSentFor: string|null;
}) {
  const { status, currentPeriodEnd, graceUntil, today } = i;
  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  if (status === 'suspended' || status === 'cancelled')
    return { action: 'none' as const, status, isActive: false, graceUntil, reminderSentFor: i.reminderSentFor };
  if (status === 'active' && today >= currentPeriodEnd) {
    const g = addDaysStr(currentPeriodEnd, i.graceDays);
    return { action: 'enter_grace' as const, status: 'past_due' as SubStatus, isActive: true, graceUntil: g, reminderSentFor: i.reminderSentFor };
  }
  if (status === 'past_due' && graceUntil && today >= graceUntil)
    return { action: 'suspend' as const, status: 'suspended' as SubStatus, isActive: false, graceUntil, reminderSentFor: i.reminderSentFor };
  // reminder window (still active, within reminderDaysBefore of end, not yet sent this cycle)
  if (status === 'active' && daysBetween(today, currentPeriodEnd) <= i.reminderDaysBefore
      && daysBetween(today, currentPeriodEnd) >= 0 && i.reminderSentFor !== currentPeriodEnd)
    return { action: 'send_reminder' as const, status, isActive: true, graceUntil, reminderSentFor: currentPeriodEnd };
  return { action: 'none' as const, status, isActive: status !== 'suspended' && status !== 'cancelled', graceUntil, reminderSentFor: i.reminderSentFor };
}
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEq(expected, signature);
}
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEq(expected, signature);
}
function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
```
Note: implement `addOneMonth` so `2026-01-31 → 2026-02-28`. The snippet's `Date.UTC(y, m, 1)` uses `m` (1-based input month) as the 0-based next month — verify against the tests and adjust if off-by-one.

- [ ] **Step 4: Run tests → PASS; `npx tsc --noEmit` → clean.**
- [ ] **Step 5: Commit** `feat(billing): pure helpers — GST, state machine, signatures`.

---

### Task 2: Migration 065 — billing tables, RLS, seed, config, cron

**Files:** Create `database/migrations/065_billing.sql`.

**Interfaces (Produces):** tables `billing_plans`, `subscriptions`, `payments`, `billing_webhook_events`, `billing_config`; seeded plans + config; pg_cron `billing-sweep`.

- [ ] **Step 1: Write the migration** (verify referenced `workspaces(id)` exists — it does):

```sql
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
```

- [ ] **Step 2:** Re-read the file; confirm CHECK constraints, unique/index/FK correct, REVOKE-style RLS present, seeds match the paise in Global Constraints. No app test.
- [ ] **Step 3: Commit** `feat(billing): migration 065 — billing tables, RLS, seed, cron`.

---

### Task 3: `lib/razorpay.ts` — hardened REST client

**Files:** Modify/replace `lib/razorpay-billing.ts` → consolidate into `lib/razorpay.ts` (keep old path re-exporting if imported elsewhere — grep first). Test `tests/razorpay.test.ts` (signature-verify passthrough only; no network).

**Interfaces (Produces):**
- `razorpayFetch(path: string, method: string, body?: object): Promise<any>` (Basic auth `KEY_ID:KEY_SECRET`, base `https://api.razorpay.com/v1`, 20s AbortController, throws on non-2xx with Razorpay error message)
- `createOrder(a: { amountPaise: number; receipt: string; notes?: Record<string,string> }): Promise<{ id: string }>`
- `createPlan(a: { period: string; interval: number; name: string; amountPaise: number }): Promise<{ id: string }>`
- `createSubscription(a: { planId: string; totalCount: number; notes?: Record<string,string>; customerNotify?: boolean }): Promise<{ id: string; short_url?: string }>`
- `fetchSubscription(id: string): Promise<any>`; `updateSubscriptionPlan(id: string, planId: string): Promise<any>`; `cancelSubscription(id: string, atCycleEnd: boolean): Promise<any>`
- re-export `verifyPaymentSignature`, `verifyWebhookSignature` from `lib/billing.ts`
- `getKeyId(): string` (public key for the client)

- [ ] **Step 1:** Grep for existing importers of `lib/razorpay-billing.ts` / `lib/stripe.ts`; note them (the checkout/webhook routes are rewritten in Tasks 4-5; leave `lib/stripe.ts` untouched/dead).
- [ ] **Step 2:** Implement using `getRequiredSecret('RAZORPAY_KEY_ID'|'RAZORPAY_KEY_SECRET')`. Basic auth header `Buffer.from(`${keyId}:${keySecret}`).toString('base64')`. `createOrder` POSTs `/orders` `{ amount, currency:'INR', receipt, notes }`. `createSubscription` POSTs `/subscriptions` `{ plan_id, total_count, customer_notify:1, notes }`. `updateSubscriptionPlan` PATCHes `/subscriptions/:id` `{ plan_id, schedule_change_at:'cycle_end' }`. `cancelSubscription` POSTs `/subscriptions/:id/cancel` `{ cancel_at_cycle_end: atCycleEnd?1:0 }`.
- [ ] **Step 3:** Test: `getKeyId` throws when unset (mock env); `verifyPaymentSignature`/`verifyWebhookSignature` re-exports work (same vectors as Task 1). No network calls in tests.
- [ ] **Step 4:** `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(billing): hardened Razorpay REST client (lib/razorpay.ts)`.

---

### Task 4: Checkout + verify routes

**Files:** Create `app/api/billing/checkout/route.ts`, `app/api/billing/verify/route.ts`. Modify: none else.

**Interfaces (Consumes):** `computeAmounts`, `planKeyFor`, `formatInvoiceNo`, `addOneMonth`, `verifyPaymentSignature` (Task 1); `createOrder`, `createSubscription`, `getKeyId` (Task 3); tables (Task 2).

- [ ] **Step 1:** `POST /api/billing/checkout` — auth `requireWorkspacePermission(workspaceId,'billing_management')`. Body `{ workspaceId, has_instagram: boolean, mode: 'manual'|'auto' }`. Load plan from `billing_plans` by `planKeyFor(has_instagram)`.
  - `mode='manual'`: `createOrder({ amountPaise: plan.total_paise, receipt: 'ws_'+workspaceId.slice(0,8)+'_'+Date.now-less receipt, notes: { workspace_id, plan_key: plan.key } })`. Insert a `payments` row `status='created'` with `razorpay_order_id`, workspace, base/gst/total (`computeAmounts(plan.base_paise)`), `period_start=today`, `period_end=addOneMonth(today)`. Return `{ mode:'manual', order_id, amount: plan.total_paise, currency:'INR', key_id: getKeyId(), name: plan.name }`. (No `Date.now()` in workflow scripts — this is a normal route, `Date.now()` is fine here.)
  - `mode='auto'`: `createSubscription({ planId: plan.razorpay_plan_id, totalCount: 120, notes: { workspace_id, plan_key: plan.key } })`. Upsert `subscriptions` row `{ workspace_id, plan_key, mode:'auto', has_instagram, status:'pending', razorpay_subscription_id }`. Return `{ mode:'auto', subscription_id, key_id: getKeyId() }`.
  - If `plan.razorpay_plan_id` is null (not yet configured) for auto mode → 503 `{ error: 'auto-pay not configured' }`.
- [ ] **Step 2:** `POST /api/billing/verify` (manual) — auth same. Body `{ workspaceId, razorpay_order_id, razorpay_payment_id, razorpay_signature }`. Load the `payments` row by `razorpay_order_id`; **verify it belongs to `workspaceId`** (cross-tenant guard) and `status='created'`. `verifyPaymentSignature(order_id, payment_id, signature, getRequiredSecret('RAZORPAY_KEY_SECRET'))` → if false, 400. On success: set payment `status='captured'`, `razorpay_payment_id`, `paid_at=now`, `invoice_no = formatInvoiceNo(nextSeq, year)` (nextSeq from a `count(*) where invoice_no not null` +1, or a DB sequence — use `(select count(*)+1 from payments where invoice_no is not null)`), and **upsert the `subscriptions` row** `{ workspace_id, plan_key, mode:'manual', status:'active', has_instagram, current_period_start, current_period_end, grace_until:null, reminder_sent_for:null }`, and set `workspaces.is_active=true, subscription_status='active'`. Idempotent if already captured (return ok).
- [ ] **Step 3:** `npx tsc --noEmit` clean. Manual reasoning check: cross-tenant order reuse blocked (payment row workspace must equal caller); amount taken from our DB, not client.
- [ ] **Step 4: Commit** `feat(billing): checkout + payment-verify routes`.

---

### Task 5: Idempotent, signature-verified webhook (state machine)

**Files:** Replace `app/api/billing/razorpay-webhook/route.ts`.

**Interfaces (Consumes):** `verifyWebhookSignature`, `computeAmounts`, `addOneMonth`, `formatInvoiceNo` (Task 1); tables (Task 2); `lib/mailer.ts` `sendMail`; `notifications` table.

- [ ] **Step 1:** Read the **raw** body (`await req.text()`), read `X-Razorpay-Signature` + `x-razorpay-event-id` headers. `runtime='nodejs'`. Verify signature with `getRequiredSecret('RAZORPAY_WEBHOOK_SECRET')` → 400 if bad (before any DB work).
- [ ] **Step 2: Idempotency** — `INSERT INTO billing_webhook_events (event_id, event_type, payload) VALUES (...) ON CONFLICT (event_id) DO NOTHING`; if 0 rows inserted → return 200 `{ status:'duplicate' }` without processing.
- [ ] **Step 3: Handle events** (resolve workspace: subscription.* → `subscriptions` by `razorpay_subscription_id`; order/payment.* → `payments` by `razorpay_order_id` or `notes.workspace_id`):
  - `subscription.activated` / `subscription.charged`: subscription row → `status='active'`, `current_period_start`/`current_period_end` (from payload `current_start`/`current_end` epoch → date, else today..addOneMonth(today)), `grace_until=null`, `reminder_sent_for=null`; `workspaces.is_active=true, subscription_status='active'`. On `charged`, insert a `payments` row (captured, amounts from plan, invoice_no). 
  - `subscription.pending`: `status='past_due'`, set `grace_until` = today + `billing_config.grace_days`; notify overdue.
  - `subscription.halted`: `status='suspended'`, `workspaces.is_active=false, subscription_status='suspended'`; email "subscription ended — pay to restart".
  - `subscription.cancelled`: `status='cancelled'`, `cancel_at_period_end`; access ends at period end (cron suspends) — set `subscription_status='cancelled'`.
  - `payment.captured` / `order.paid`: mark matching `payments` row captured (idempotent with verify route); ensure workspace active (manual path safety net).
  - `payment.failed`: mark matching payment `failed` (no state change).
  - `refund.processed`: mark payment `refunded`.
  - Unhandled events: 200 ignore.
- [ ] **Step 4:** Always 200 on handled/ignored (so Razorpay doesn't retry needlessly) except signature failure (400). Per-event try/catch; log errors. Emails via `sendMail` (not inline Resend).
- [ ] **Step 5:** `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat(billing): idempotent signature-verified webhook + state machine`.

---

### Task 6: API-layer suspension guard + one-plan de-gating

**Files:** Create `lib/billing-guard.ts`. Modify: `app/api/messages/send/route.ts`, the campaign run/enqueue route(s) + `app/api/cron/process-campaign-queue/route.ts` (or equivalent), the inbound AI-reply path in `app/api/webhooks/whatsapp/route.ts`, and the feature-gating sites (`components/layout/Sidebar/index.tsx` + wherever `hasFeature`/plan-tier gates CRM/Flows).

**Interfaces (Produces):** `getBillingState(db, workspaceId): Promise<{ status: SubStatus; isActive: boolean; hasInstagram: boolean }>`; `class SuspendedError extends Error`; `assertWorkspaceActive(db, workspaceId): Promise<void>` (throws `SuspendedError` when `status ∈ {suspended,cancelled}` or `is_active=false`).

- [ ] **Step 1:** Implement `lib/billing-guard.ts` reading `subscriptions` + `workspaces.is_active`. `assertWorkspaceActive` throws `SuspendedError` (mapped to HTTP 402 `{ error:'subscription_inactive' }` by callers).
- [ ] **Step 2:** Apply `assertWorkspaceActive` in: outbound `messages/send` (before send); campaign run + queue-processing cron (skip/deny suspended workspaces); inbound webhook — guard only the **automated AI reply/send** (still record the inbound message + conversation; do not block ingestion). Return 402 on the API routes; on the cron, skip the workspace.
- [ ] **Step 3: De-gate features** — make CRM/Flows/etc. available to all active workspaces (remove the plan-tier `hasFeature` checks that hid them for non-Pro), since there is now one plan. Gate the **Instagram** inbox/nav on `subscriptions.has_instagram` instead. Confirm the sidebar + any per-feature guards reflect this.
- [ ] **Step 4:** `npx tsc --noEmit` clean. Grep to confirm no remaining plan-tier gate blocks a core feature.
- [ ] **Step 5: Commit** `feat(billing): API-layer suspension guard + collapse to one plan`.

---

### Task 7: Billing-sweep cron route

**Files:** Create `app/api/cron/billing-sweep/route.ts`.

**Interfaces (Consumes):** `nextBillingAction` (Task 1); `billing_config`, `subscriptions` (Task 2); `sendMail`, `notifications`.

- [ ] **Step 1:** POST, `runtime='nodejs'`, `maxDuration=300`. Verify `Authorization: Bearer <CRON_SECRET>` (via `getRequiredSecret('CRON_SECRET')`) **before** any DB access, matching `app/api/cron/meta-spend-sync/route.ts`.
- [ ] **Step 2:** Load `billing_config` (grace_days, reminder_days_before). For each subscription where `is_comped=false`: compute `nextBillingAction({...row, today, graceDays, reminderDaysBefore})`. Apply:
  - `send_reminder` → email + in-app "recharge" reminder (amount from plan, `total_paise`), set `reminder_sent_for`.
  - `enter_grace` → update `status='past_due'`, `grace_until`; email "payment overdue, pay within N days".
  - `suspend` → `status='suspended'`, `workspaces.is_active=false, subscription_status='suspended'`; email "subscription ended — pay to restart".
  - `none` → skip.
  Per-workspace try/catch; return `{ processed, reminded, graced, suspended, failed }`.
- [ ] **Step 2b:** The pg_cron schedule already exists (migration 065). No schedule change here.
- [ ] **Step 3:** `npx tsc --noEmit` clean.
- [ ] **Step 4: Commit** `feat(billing): daily billing-sweep cron (reminders, grace, suspend)`.

---

### Task 8: Client billing page + checkout UI

**Files:** Modify `modules/settings/components/BillingSettings/index.tsx` (+ small sibling components if it grows). Add a billing-status API if needed: `app/api/billing/status/route.ts` (current subscription + payments history for the workspace, auth `view_analytics` or `billing_management`).

**Interfaces (Consumes):** checkout/verify routes (Task 4); `rupees`, `computeAmounts` (Task 1). Razorpay Checkout script (`https://checkout.razorpay.com/v1/checkout.js`).

- [ ] **Step 1:** `GET /api/billing/status?workspaceId=` → `{ subscription: {plan_key, status, mode, has_instagram, current_period_end, ...}, plan: {base_paise, gst_paise, total_paise, name}, payments: [...] }`. Workspace-scoped, auth-gated.
- [ ] **Step 2:** Rebuild the billing panel: current plan + **status badge** (Active/Past Due/Suspended/Cancelled), monthly amount with **GST broken out** (base + 18% + total via `rupees`), **Instagram add-on toggle** (changes plan → re-checkout or PATCH), **payment mode** (auto-pay on/off), **Pay Now** (manual), **billing history** table from `payments` (date, invoice_no, amount, status), **next billing date**.
- [ ] **Step 3:** Checkout flow: load Razorpay script; **Pay Now** → `POST /checkout {mode:'manual'}` → open Razorpay Checkout with returned `order_id`+`key_id` → on success `POST /verify` → refresh status. **Enable auto-pay** → `POST /checkout {mode:'auto'}` → Checkout with `subscription_id` → success handled by webhook; poll/refresh status. Guard: don't submit without a mode; show GST-inclusive total before pay.
- [ ] **Step 4:** Match existing settings styling; use existing `Card`/`Button`/`Badge`/`Table` primitives. `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(billing): client billing page + Razorpay checkout UI`.

---

### Task 9: Super-admin billing views + `requirePlatformAdmin`

**Files:** Create `lib/require-platform-admin.ts`; `app/api/admin/billing/route.ts`; admin UI `modules/admin/components/BillingOverview/index.tsx` + page wiring. Optionally refactor a couple of existing admin routes to use the new helper (low-risk; only if trivial).

**Interfaces (Produces):** `requirePlatformAdmin(): Promise<{ userId: string }>` (throws/returns 403) — centralizes the duplicated `is_platform_admin` check.

- [ ] **Step 1:** Implement `requirePlatformAdmin()` mirroring the existing `checkAdmin()` pattern (e.g. in `app/api/admin/meta-billing/route.ts`) — auth user → `profiles.is_platform_admin` → throw `AuthzError`/return null → 403.
- [ ] **Step 2:** `GET /api/admin/billing` (strictly platform-admin): **MRR** = sum of `plan.total_paise` for `status='active'` subscriptions; counts by status (active/past_due/suspended/cancelled); **Instagram add-on revenue** = active subs with `has_instagram` × add-on total; **payment history** (recent `payments`, joined workspace name); **failed/overdue** list; **reconciliation** = subscriptions whose `status` disagrees with the latest `billing_webhook_events` for their `razorpay_subscription_id` (best-effort). Group money by currency (INR only for now). Never cap at 1000 — use `count`/aggregation.
- [ ] **Step 3:** `PATCH /api/admin/billing/config` → update `billing_config.grace_days`/`reminder_days_before` (platform-admin only).
- [ ] **Step 4:** Admin UI: MRR + status cards, revenue, payment-history table, overdue list, grace-days config input. Match admin styling (`MetaBillingOverview`/`RevenueDashboard`), recharts for any chart. Add a nav entry.
- [ ] **Step 5:** `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat(billing): super-admin billing views + requirePlatformAdmin`.

---

## Post-implementation (controller / cutover)

1. Apply migration 065 live (inline cron URL+secret, per 063).
2. **Test-mode Razorpay** (if keys available): create the two Plans (or via `createPlan`), record `razorpay_plan_id` into `billing_plans`; run manual Order → verify → activation; simulate `subscription.charged`/`pending`/`halted` via the dashboard "Charge now"/webhook test; confirm idempotency (same `x-razorpay-event-id` twice → one effect); confirm suspended workspace's send/campaign/AI-reply is blocked while inbound is still recorded; cross-tenant activation blocked.
3. **Existing-client seeding** (idempotent script): for each active workspace without a `subscriptions` row, insert `{ mode:'manual', status:'active', plan_key:'whatsapp', current_period_start:'2026-08-01', current_period_end:'2026-09-01' }` (super-admin can set `has_instagram`/`is_comped`). Run at cutover.
4. Whole-branch review (opus) → merge → push → tell user to redeploy + set live keys + webhook.

## Self-Review

- **Spec coverage:** GST/state/signatures (T1), tables+RLS+seed+cron (T2), Razorpay client (T3), checkout/verify (T4), idempotent webhook+state machine (T5), API-layer guard + de-gate (T6), sweep cron reminders/grace/suspend (T7), client UI+GST+history (T8), super-admin+MRR+grace config+requirePlatformAdmin (T9), existing-client seeding + live verify (controller). Financial-retention exclusion (T2 comment + guard). All spec sections mapped.
- **Placeholders:** none — money/crypto/state code is concrete; UI/admin tasks give exact contracts + which primitives/patterns to follow.
- **Type consistency:** `SubStatus`, `PlanKey`, `computeAmounts`, `nextBillingAction`, `verifyPaymentSignature`/`verifyWebhookSignature`, `getBillingState`/`assertWorkspaceActive`, `requirePlatformAdmin` names consistent across tasks; `payments.status` (created|captured|failed|refunded) and `subscriptions.status` (pending|active|past_due|suspended|cancelled) used consistently in T2/T4/T5/T7/T9.

## Known dependency

Live go-live needs Razorpay **Subscriptions enabled** + keys + the two Plans created + webhook endpoint registered. The build + review + unit tests do not require keys; the test-mode integration + live cutover do.

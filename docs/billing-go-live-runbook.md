# Billing Go-Live Runbook

**Purpose:** switch Razorpay billing from **test** to **live** so the 12 seeded clients can actually pay before the 1-Sep-2026 expiry — OR comp them so no billing pressure fires. Pick **one** of the two paths below.

**Current state (2026-08-14):**
- 12 real clients seeded: `whatsapp / monthly / manual / active`, period **2026-08-01 → 2026-09-01**, `is_comped=false`.
- Razorpay keys in Coolify are **TEST** (`rzp_test_…`). Real cards cannot be charged.
- Billing sweep (`/api/cron/billing-sweep`, daily 04:30 IST) reads `reminder_days_before=3`, `grace_days=3` and **skips `is_comped=true`**.

**The clock (per seeded client, if NOT comped):**
| Date | Event |
|---|---|
| **~2026-08-29** | Reminder notification + email ("renews on 2026-09-01, ₹3,538.82 due") |
| **2026-09-01** | Period ends → `past_due`, `grace_until = 2026-09-04` |
| **~2026-09-04** | Still unpaid → `suspended` (outbound sends return 402) |

> You must complete **Path A** or **Path B** before ~29 Aug, or reminders go out to clients who can't pay.

---

## Path B — Comp all 12 (fastest, reversible) — do this if going live isn't ready

Marks every real client `is_comped=true`; the sweep skips them entirely (no reminder, no grace, no suspend). Service keeps running. Reverse anytime.

```bash
cd "d:/Agentix Project/WhatsApp-Automation"
node <scratchpad>/comp-clients.mjs            # DRY RUN — lists the 12, changes nothing
node <scratchpad>/comp-clients.mjs --apply    # sets is_comped=true
# To undo later (re-enable billing):
node <scratchpad>/comp-clients.mjs --uncomp --apply
```
No redeploy needed — it's a DB flag the next sweep reads. **Done.** (You can still go live later and un-comp per client as they agree to pay.)

---

## Path A — Go LIVE on Razorpay

### Phase 1 — Manual "Pay now" (the minimum that unblocks expiry)

One-time orders need **only** live key/secret + webhook secret. No per-plan setup. This lets every client pay for any term from Settings → Billing.

1. **Activate a Razorpay LIVE account** (dashboard.razorpay.com) — complete KYC / business verification. This is the long pole (can take 1–3 business days), so start it first.
2. **Generate LIVE API keys**: Dashboard → Settings → API Keys → *Generate Live Key*. Copy `rzp_live_…` (Key ID) and the Key Secret (shown once).
3. **Create the LIVE webhook**: Dashboard → Settings → Webhooks → *Add New Webhook*:
   - **URL:** `https://app.aiagentixdev.com/api/billing/razorpay-webhook`  *(confirm this is your production domain)*
   - **Secret:** choose one (this becomes `RAZORPAY_WEBHOOK_SECRET`).
   - **Active events:** `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, and (for Phase 2) `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`.
4. **Swap the 3 env vars in Coolify** (Project → Environment) to the live values:
   ```
   RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXXXX
   RAZORPAY_KEY_SECRET=<live key secret>
   RAZORPAY_WEBHOOK_SECRET=<the webhook secret from step 3>
   ```
   Leave `CRON_SECRET` unchanged (`c82f…`).
5. **Redeploy** in Coolify. (Push already done — `origin/main` is current.)
6. **Smoke test with ONE real client** (or your own workspace): Settings → Billing → *Pay now* → complete a real payment (use the smallest term, or refund it after). Verify: `payments` row goes `created → captured`, `subscriptions.status='active'`, `current_period_end` advanced, workspace `is_active=true`. Refund from the Razorpay dashboard if it was just a test.

> ⚠ **Anchor drift (by design):** manual pay sets the new period from the **pay date**, not from 2026-09-01 — a client paying 30 Aug gets 30-Aug → 30-Sep. Acceptable for self-serve. If you want everyone re-anchored to the 1st, say so and we'll add a one-liner to the verify path or a post-payment normalizer.

**After Phase 1 you can comp the rest and un-comp each as they pay**, or just let the reminders drive them to *Pay now*.

### Phase 2 — Auto-pay / recurring (optional, do later)

Only needed if you want cards charged automatically each cycle. Requires a Razorpay **Plan** per (channel × term) you offer.

1. In the LIVE dashboard → Subscriptions → Plans → create one plan per row you want to offer:

   | key / term | Amount (GST-incl) | Razorpay period / interval |
   |---|---|---|
   | whatsapp / monthly | ₹3,538.82 | monthly / 1 |
   | whatsapp / quarterly | ₹10,616.46 | monthly / 3 |
   | whatsapp / half_yearly | ₹17,700.00 | monthly / 6 |
   | whatsapp / yearly | ₹35,400.00 | yearly / 1 |
   | whatsapp_instagram / monthly | ₹4,717.64 | monthly / 1 |
   | whatsapp_instagram / quarterly | ₹14,152.92 | monthly / 3 |
   | whatsapp_instagram / half_yearly | ₹23,600.00 | monthly / 6 |
   | whatsapp_instagram / yearly | ₹47,200.00 | yearly / 1 |

2. Paste each `plan_…` id into `set-live-plan-ids.mjs` and run:
   ```bash
   node <scratchpad>/set-live-plan-ids.mjs            # DRY RUN
   node <scratchpad>/set-live-plan-ids.mjs --apply    # writes billing_plans.razorpay_plan_id
   ```
   No redeploy — the checkout route reads `razorpay_plan_id` per request. The "Enable auto-pay" button now works for the terms you filled.

---

## Rollback / safety
- Reverting env vars to `rzp_test_…` + redeploy returns to test mode instantly.
- Comping (Path B) is reversible with `--uncomp`.
- Financial tables are RLS deny-all (service-role only); these scripts connect via `SUPABASE_DB_URL`, not the app.

<scratchpad> = `C:\Users\monum\AppData\Local\Temp\claude\d--Agentix-Project-WhatsApp-Automation\2dc9b730-8b44-4c58-8795-89cf1f75d272\scratchpad`

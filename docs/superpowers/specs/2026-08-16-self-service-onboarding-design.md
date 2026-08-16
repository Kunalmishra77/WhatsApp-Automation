# Self-Service Onboarding & Auto-Provisioning — Design Spec

**Date:** 2026-08-16
**Status:** Design approved; pending spec review → writing-plans
**Part of:** Public SaaS Transformation — Project A (of A: onboarding, B: marketing website, C: AI CRM automation)

## Problem

The platform provisions tenants **manually**: a Super-Admin runs `admin/create-client` (or invites),
creating the auth user + workspace + membership, and a workspace only reaches the dashboard after a
human approval or a billing event. We are converting to a **public, self-service SaaS**: a visitor
signs up, verifies email, provides business details, picks a plan, pays, and the platform
**auto-provisions** their workspace and drops them into the dashboard — **no human approval**.

## Locked decisions

1. **Pay-to-provision** — the workspace is created at signup in an explicit *inactive/unpaid* state;
   a successful payment activates it. (Reuses the existing billing-keyed-by-`workspace_id` activation.)
2. **Email verification only** (6-digit code) before provisioning. No phone OTP.
3. **WhatsApp connection is a guided/admin-assisted step**, not part of this project — a new workspace
   reaches the dashboard with a "Connect WhatsApp" banner; your team wires the WABA (Meta Embedded
   Signup = a future project). WhatsApp is NOT a hard gate to the dashboard.
4. **Auto-provision on payment; keep the admin path for internal only** — `admin/create-client` +
   invites stay for enterprise/manual onboarding, removed from the public journey. No manual approval
   in the normal flow. (Payment is the fraud signal.)

## Architecture — the provisioning model

Billing already activates a workspace on payment (`app/api/billing/verify` + the Razorpay webhook set
`workspaces.is_active=true, subscription_status='active'`). So we **create the workspace at signup,
inactive**, and let the existing payment path flip it live — no "provision inside the webhook" logic.

### Flow + state machine
```
/signup  →  create auth user (email UNconfirmed)  →  verify email (6-digit code, resendable)
  →  business details (workspace name+slug, company, owner_phone, industry)
  →  createWorkspace  [is_active=false, subscription_status='incomplete', onboarding_complete=true]
       + workspace_members(super_admin)
  →  plan select (real billing_plans: whatsapp / whatsapp_instagram × term, with offers)
  →  /api/billing/checkout (existing, keyed by the new workspace_id)
  →  payment  →  /api/billing/verify + webhook  →  [is_active=true, subscription_status='active']
  →  dashboard (with a "Connect WhatsApp" banner)
```

**Workspace `subscription_status` for self-serve:** `incomplete` (created, unpaid) → `active` (paid).
`pending_approval` is reserved for the internal admin path only (never entered by self-serve).
`onboarding_complete` is set **true at workspace creation** for self-serve (WhatsApp is no longer a
hard gate), so the dashboard gate turns purely on `is_active`.

### Dashboard gate change (`app/(dashboard)/layout.tsx`)
Current: `is_active=false` → `/pending-approval` (if `pending_approval`) else `/payment-required`.
New: add `subscription_status='incomplete'` → route to the **plan-select/checkout step** (resume the
signup wizard where they left off) — never a human-approval dead-end. `active` → dashboard.

## Reused (no rebuild)
- `modules/auth/components/SignupForm.tsx` + `signupAction` (`app/actions/auth.actions.ts`) — re-wire.
- `createWorkspaceAction` (`app/actions/workspace.actions.ts`) — extend with business fields + explicit state.
- Entire billing chain: `app/api/billing/{checkout,verify,razorpay-webhook}` — activation unchanged.
- Role model: self-created owner = `super_admin` (full perms incl. `billing_management`).
- `PLAN_LIMITS`/`getLimits` (computed on the fly — no seed rows needed) + Billing-v2 plan/term/offer UI.

## New / fixed (the work)
1. **Re-enable `/signup`** (`app/(auth)/signup/page.tsx` — replace the `redirect('/login')` stub with
   the existing `SignupForm`) + a public "Get Started" entry point.
2. **Enforce email verification:** change `signUp()` (`modules/auth/services/auth.service.ts`) to
   create the user **unconfirmed** + issue a 6-digit code (store hashed in a new `email_otps` table:
   `user_id, code_hash, expires_at (10 min), attempts`); wire the (currently-dead) `verify-email`
   page + a `POST /api/auth/verify-email` (check code → confirm the Supabase user) + resend endpoint
   (rate-limited). Block progression to workspace creation until confirmed. Login keeps its existing
   force-confirm fallback for legacy/admin-created users.
3. **Onboarding wizard** — a resumable multi-step flow (`app/(auth)/onboarding/*` or
   `app/(onboarding)/*`): verify → business details → plan select → checkout → activation redirect.
   State derived from the user's workspace status so a returning user resumes at the right step.
4. **One explicit self-serve state machine** — `createWorkspaceAction` sets
   `is_active=false, subscription_status='incomplete', onboarding_complete=true` explicitly (no
   reliance on permissive column defaults); stop `/api/onboarding/complete` from forcing
   `pending_approval`/inactive for self-serve (that route becomes internal/WhatsApp-setup only, or is
   bypassed). Payment is the only activator in the public flow.
5. **Plan reconciliation:** the signup plan-select reads the **real `billing_plans`** (whatsapp +
   whatsapp_instagram add-on + monthly/quarterly/half_yearly/yearly + offers), NOT the legacy
   `free/starter/pro/enterprise` `PLAN_DISPLAY`. Map the selected billing plan/term onto the
   workspace + the existing checkout call.
6. **Remove manual approval from the public path** — the normal journey never enters
   `pending_approval`; `admin/create-client` + invites remain for internal use only.

## Business details collected at signup
Workspace name (+ auto slug), company/business name, owner phone, industry — populate the existing
`workspaces.owner_email/owner_phone/industry` columns (currently only the admin path fills them).

## Error handling
- **Abandoned signup** (verified/unverified user, no workspace): harmless; the user can resume; a
  cleanup for stale unverified users + expired `email_otps` (cron or lazy).
- **Abandoned payment**: the workspace sits `incomplete`+inactive; the dashboard gate resumes them at
  the plan/checkout step. No orphaned "active" workspace ever created without payment.
- **Payment activation**: webhook-driven + idempotent (existing) — the client-side `/verify` and the
  webhook both flip the workspace active; either alone suffices.
- **Duplicate email**: existing 400 from `signUp()`/`createUser`.
- **Email code**: 10-min expiry, max attempts, rate-limited resend.

## Security
- New endpoints (`verify-email`, resend, the wizard actions) are auth-scoped to the signed-in user;
  the workspace-create + checkout paths keep their existing RLS/permission checks (a self-serve owner
  is `super_admin` on their own workspace only). Email codes stored **hashed**. No cross-tenant surface
  (a user only ever provisions/pays for their own new workspace).
- Public signup is now an open endpoint → keep the duplicate-email guard, add basic rate-limiting on
  signup + resend to blunt abuse (payment is the real fraud gate for provisioning).

## Razorpay-pending (external config, per master prompt §1)
The charge step can't *complete* until tomorrow's Live keys. Everything else builds now; until then,
signup runs up to the payment screen, and **internal testing** activates a signed-up workspace via the
existing admin activation / `is_comped` path (no new toggle needed). When Live keys land, the public
flow completes end-to-end with zero further code changes.

## Testing
- **Unit:** the workspace state-machine transitions (incomplete→active; gate routing per state);
  email-code hashing/verify/expiry.
- **Integration/live:** full signup → verify → business details → workspace(inactive) → plan select →
  (admin-activate as payment stand-in until Razorpay live) → dashboard; returning-user resume at each
  step; duplicate email; abandoned payment resume; dashboard-gate routing for each `subscription_status`.
- **Security:** cross-tenant (a user cannot provision/checkout for another workspace); email-code brute
  force (attempt cap); public signup rate-limit.

## Out of scope (later projects)
Meta Embedded Signup / self-serve WhatsApp connection (Project — WhatsApp onboarding); the marketing
website that funnels into `/signup` (Project B); AI CRM automation (Project C); reconciling the two
pricing systems beyond using `billing_plans` for checkout; phone OTP; free-trial mechanism (we chose
pay-to-provision — no trial).

## Self-review notes
- The provisioning-model choice (create-inactive-at-signup, activate-on-payment) reuses the existing
  billing activation verbatim — smallest, safest change; no workspace is ever created inside a webhook.
- `onboarding_complete=true` at creation (WhatsApp not a hard gate) is the deliberate resolution of the
  gate dead-end; the WhatsApp-setup wizard becomes optional/assisted, surfaced as a dashboard banner.
- One explicit state (`incomplete`) replaces the two-paths-disagree default inconsistency.
- Plan reconciliation is scoped to "use billing_plans for checkout," not a full pricing-system merge.

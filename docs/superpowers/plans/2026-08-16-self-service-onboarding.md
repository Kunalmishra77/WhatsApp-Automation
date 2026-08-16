# Self-Service Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a visitor sign up publicly, verify email, enter business details, pick a plan, pay, and have their workspace auto-provisioned into the dashboard — no manual admin approval.

**Architecture:** The workspace is created at signup in an explicit *inactive/unpaid* state (`is_active=false, subscription_status='incomplete', onboarding_complete=true`); the EXISTING billing chain (checkout → verify/webhook) flips it `active` on payment — no "provision inside the webhook" logic. A resumable onboarding wizard derives its current step from the user's workspace state. Email verified via a 6-digit code in a new `email_otps` table.

**Tech Stack:** Next.js 15 (App Router, server actions, route handlers `runtime='nodejs'`), Supabase (auth admin API + Postgres), TypeScript strict, Vitest, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-08-16-self-service-onboarding-design.md`

## Global Constraints

- **Provisioning model:** workspace created at signup, inactive; payment activates it (reuse `app/api/billing/{checkout,verify,razorpay-webhook}` UNCHANGED). Never create a workspace inside a webhook.
- **Self-serve workspace initial state (exact):** `is_active=false`, `subscription_status='incomplete'`, `onboarding_complete=true`. `pending_approval` is RESERVED for the internal admin path — the public flow never enters it.
- **Verification:** email only, 6-digit code, 10-min expiry, hashed at rest, attempt-capped, rate-limited resend. No phone OTP.
- **WhatsApp is NOT a hard gate** — dashboard reachable with `is_active=true` regardless of WABA; a "Connect WhatsApp" banner is shown when creds are absent.
- **Keep** `admin/create-client` + team invites for internal/enterprise; remove manual approval from the public journey only.
- **Plans:** signup plan-select uses the REAL `billing_plans` (keys `whatsapp`/`whatsapp_instagram` × term monthly/quarterly/half_yearly/yearly + offers), NOT the legacy `free/starter/pro/enterprise` `PLAN_DISPLAY`.
- **Owner role:** self-serve workspace creator = `super_admin` (unchanged).
- Windows: Bash for `npx tsc --noEmit` (slow, allow 5 min), `npx vitest run`, git. Do NOT run `npx next build`.

---

### Task 1: Migration — `email_otps` + workspace state constants

**Files:**
- Create: `database/migrations/072_email_otps.sql`
- Create: `lib/onboarding-state.ts`
- Test: `lib/onboarding-state.test.ts`

**Interfaces (Produces):**
- Table `email_otps(id uuid pk, user_id uuid FK auth.users ON DELETE CASCADE, code_hash text, expires_at timestamptz, attempts int default 0, created_at)` + index on `user_id`, RLS deny-all.
- `lib/onboarding-state.ts`: `type OnboardingStep = 'verify_email' | 'business_details' | 'plan_payment' | 'done'`; `resolveOnboardingStep(input: { emailConfirmed: boolean; workspace: { subscription_status: string; is_active: boolean } | null }): OnboardingStep`; constants `SELF_SERVE_INITIAL = { is_active: false, subscription_status: 'incomplete', onboarding_complete: true } as const`.

- [ ] **Step 1:** Write `072_email_otps.sql`:
```sql
-- 072_email_otps.sql — email verification codes for self-service signup.
CREATE TABLE IF NOT EXISTS public.email_otps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_user ON public.email_otps (user_id);
ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_otps_no_client ON public.email_otps;
CREATE POLICY email_otps_no_client ON public.email_otps FOR ALL USING (false) WITH CHECK (false);
```

- [ ] **Step 2: Write failing test** `lib/onboarding-state.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveOnboardingStep, SELF_SERVE_INITIAL } from './onboarding-state';

describe('resolveOnboardingStep', () => {
  it('unverified email → verify_email', () => {
    expect(resolveOnboardingStep({ emailConfirmed: false, workspace: null })).toBe('verify_email');
  });
  it('verified, no workspace → business_details', () => {
    expect(resolveOnboardingStep({ emailConfirmed: true, workspace: null })).toBe('business_details');
  });
  it('verified, incomplete workspace → plan_payment', () => {
    expect(resolveOnboardingStep({ emailConfirmed: true, workspace: { subscription_status: 'incomplete', is_active: false } })).toBe('plan_payment');
  });
  it('active workspace → done', () => {
    expect(resolveOnboardingStep({ emailConfirmed: true, workspace: { subscription_status: 'active', is_active: true } })).toBe('done');
  });
  it('SELF_SERVE_INITIAL is the explicit inactive/incomplete state', () => {
    expect(SELF_SERVE_INITIAL).toEqual({ is_active: false, subscription_status: 'incomplete', onboarding_complete: true });
  });
});
```

- [ ] **Step 3: Run** `npx vitest run lib/onboarding-state.test.ts` → FAIL.
- [ ] **Step 4: Implement** `lib/onboarding-state.ts` with `resolveOnboardingStep` (email unconfirmed → `verify_email`; else no workspace → `business_details`; else workspace `is_active` → `done`; else → `plan_payment`) + `SELF_SERVE_INITIAL`.
- [ ] **Step 5: Run** the test → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat(onboarding): migration 072 email_otps + onboarding state resolver`.
- [ ] **Step 7 (controller, live):** apply 072 live; verify the table exists.

---

### Task 2: Email OTP lib + verify/resend endpoints

**Files:**
- Create: `lib/email-otp.ts`
- Create: `app/api/auth/verify-email/route.ts`
- Create: `app/api/auth/resend-otp/route.ts`
- Test: `lib/email-otp.test.ts`

**Interfaces:**
- Consumes: `email_otps` table (Task 1); `createAdminClient`; `lib/mailer` (grep it — used by `admin/create-client`; reuse its send function).
- Produces: `lib/email-otp.ts`: `generateOtp(): string` (6 digits, crypto); `hashOtp(code: string): string` (sha256 hex); `issueOtp(db, userId): Promise<string>` (generate, upsert `email_otps` with 10-min expiry + attempts=0, returns the plaintext code to email); `verifyOtp(db, userId, code): Promise<{ ok: boolean; reason?: 'expired'|'mismatch'|'too_many'|'not_found' }>` (increments attempts; caps at 5). Endpoints: `POST /api/auth/verify-email {code}` (auth’d user → verifyOtp → on ok, confirm the Supabase user via `adminDb.auth.admin.updateUserById(userId, { email_confirm: true })`, delete the otp row, return `{ok:true}`); `POST /api/auth/resend-otp` (auth’d user, rate-limited: reject if an unexpired code was issued < 60s ago → 429; else issueOtp + email).

- [ ] **Step 1: Write failing tests** `lib/email-otp.test.ts` (pure functions with an in-memory fake db):
```ts
import { describe, it, expect } from 'vitest';
import { generateOtp, hashOtp } from './email-otp';
describe('generateOtp', () => {
  it('is 6 digits', () => { expect(generateOtp()).toMatch(/^\d{6}$/); });
  it('varies', () => { expect(generateOtp()).not.toBe(generateOtp()); });
});
describe('hashOtp', () => {
  it('is deterministic hex, not the plaintext', () => {
    const h = hashOtp('123456');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(hashOtp('123456'));
    expect(h).not.toBe(hashOtp('654321'));
  });
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `lib/email-otp.ts` (`generateOtp` via `crypto.randomInt(0,1e6)` padded to 6; `hashOtp` sha256; `issueOtp`/`verifyOtp` against the admin client — `verifyOtp` reads the row, checks expiry, compares `hashOtp(code)===code_hash`, increments `attempts`, returns the reason enum). **Step 4: Run** → PASS.
- [ ] **Step 5: Implement** the two route handlers (`runtime='nodejs'`; both resolve the current user via the server supabase client, 401 if none; use the admin client for `email_otps` + auth updates; reuse `lib/mailer` to send the code — subject "Your Agentix verification code", body with the 6-digit code). `resend` enforces the 60s rate-limit. `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat(onboarding): email OTP lib + verify-email/resend endpoints`.

---

### Task 3: Enforce email verification in signup + re-enable `/signup`

**Files:**
- Modify: `modules/auth/services/auth.service.ts` (`signUp`)
- Modify: `app/actions/auth.actions.ts` (`signupAction`)
- Modify: `app/(auth)/signup/page.tsx` (remove the `redirect('/login')` stub; render `SignupForm`)
- Modify: `app/(auth)/verify-email/page.tsx` (wire it to accept + submit a 6-digit code)
- Modify: `app/(auth)/login/page.tsx` login copy/link to `/signup` (add a "Create account" link) — grep the login form for where to add it.

**Interfaces:**
- Consumes: `issueOtp` (Task 2), `resolveOnboardingStep` (Task 1), the verify endpoints.

- [ ] **Step 1:** In `auth.service.ts` `signUp()`, change `email_confirm: true` → `email_confirm: false` (create UNconfirmed) so verification is required. Keep the rest (admin createUser, user_metadata full_name). NOTE: `admin/create-client` + invite-accept must KEEP `email_confirm: true` (they don't verify) — only `signUp()` (public path) changes; confirm those call sites don't share the same flag via `signUp` (grep — invite-accept uses `signUp()` too; if so, add a `confirmed=true` param to `signUp(email,password,fullName, opts?)` defaulting to unconfirmed for public signup, and pass `confirmed:true` from invite-accept to preserve its no-verify behavior).
- [ ] **Step 2:** In `signupAction`, after creating + signing in the user, call `issueOtp` + email the code, then redirect to `/verify-email` (NOT `/workspace/new`).
- [ ] **Step 3:** `app/(auth)/signup/page.tsx`: replace the stub with a server component that (if already authed → redirect to the resolved step) else renders `SignupForm`.
- [ ] **Step 4:** `verify-email/page.tsx`: a client form with a 6-digit input + Resend button → posts to `/api/auth/verify-email` and `/api/auth/resend-otp`; on success redirect to `/onboarding` (Task 5). Show expiry/attempt errors.
- [ ] **Step 5:** Add a "Create account" link on the login page pointing to `/signup`.
- [ ] **Step 6:** `npx tsc --noEmit` clean. Commit `feat(onboarding): enforce email verification + re-enable public signup`.

---

### Task 4: `createWorkspaceAction` — business details + explicit self-serve state

**Files:**
- Modify: `app/actions/workspace.actions.ts` (`createWorkspaceAction`)
- Modify: `modules/auth/components/WorkspaceCreateForm/*` (add business fields) — grep the exact path.

**Interfaces:**
- Consumes: `SELF_SERVE_INITIAL` (Task 1).
- Produces: workspace row with the explicit initial state + business fields; redirect to `/onboarding` (plan step).

- [ ] **Step 1:** Extend the form to collect: workspace name (existing) + company/business name, owner phone, industry (a small `<select>` of common industries or a free text). Keep the auto-slug.
- [ ] **Step 2:** In `createWorkspaceAction`, set the workspace insert explicitly: `{ name, slug, plan: 'whatsapp', owner_email: <current user email>, owner_phone, industry, ...SELF_SERVE_INITIAL }` (i.e. `is_active:false, subscription_status:'incomplete', onboarding_complete:true`). Insert the `workspace_members` `super_admin` row (unchanged). Redirect to `/onboarding` (the plan/payment step), NOT `/conversations`.
- [ ] **Step 3:** `npx tsc --noEmit` clean. Commit `feat(onboarding): collect business details + explicit inactive/incomplete workspace state`.

---

### Task 5: Onboarding wizard — plan select + checkout (resumable)

**Files:**
- Create: `app/(auth)/onboarding/page.tsx` (or `app/(onboarding)/onboarding/page.tsx` — match routing conventions; grep how `(auth)` group + `workspace/new` are structured)
- Create: `modules/onboarding/components/OnboardingWizard/*` (step router + PlanSelect step reusing the Billing-v2 plan/term/offer UI)

**Interfaces:**
- Consumes: `resolveOnboardingStep` (Task 1); the existing Billing-v2 checkout — grep `modules/settings/components/BillingSettings` + `CheckoutButton` + `/api/billing/checkout` for the plan/term/offer components and the checkout call to REUSE.
- Produces: a page that, based on `resolveOnboardingStep`, shows the right step; the plan step lists `billing_plans` (whatsapp / whatsapp_instagram × term with offers) and launches checkout for the user's workspace_id; on payment success the existing verify/webhook activates the workspace and the wizard redirects to `/conversations`.

- [ ] **Step 1:** `/onboarding` server component: resolve the current user + their workspace, compute `resolveOnboardingStep`; if `verify_email` → redirect `/verify-email`; if `business_details` → redirect `/workspace/new`; if `done` → redirect `/conversations`; if `plan_payment` → render `<OnboardingWizard step="plan_payment" workspaceId=…/>`.
- [ ] **Step 2:** PlanSelect step: reuse the Billing-v2 plan/term/offer selector + `CheckoutButton` (mode `manual` for pay-now) pointed at the workspace_id. On `onSuccess` (payment verified) → `router.push('/conversations')`. Loading/error states; surface the "Razorpay not configured" 400 gracefully with copy "Payment isn't live yet — an admin will activate your account shortly" (relevant until Live keys land tomorrow).
- [ ] **Step 3:** `npx tsc --noEmit` clean. Commit `feat(onboarding): plan-select + checkout wizard step`.

---

### Task 6: Dashboard-gate rerouting + kill the public approval dead-end

**Files:**
- Modify: `app/(dashboard)/layout.tsx` (the gate)
- Modify: `app/api/onboarding/complete/route.ts` (stop forcing pending_approval for self-serve)

**Interfaces:**
- Consumes: the explicit state from Task 4.

- [ ] **Step 1:** In the dashboard gate, where it currently does `is_active===false → redirect('/pending-approval' if pending_approval else '/payment-required')`, add: `subscription_status==='incomplete'` → `redirect('/onboarding')` (resume the plan/payment step). Keep `pending_approval` → `/pending-approval` (internal admin path only). `onboarding_complete===false` handling: since self-serve now sets it true at creation, this branch only affects legacy/admin/WhatsApp-setup workspaces — leave it but confirm it doesn't trap self-serve users (it won't, since they're `onboarding_complete=true`).
- [ ] **Step 2:** `app/api/onboarding/complete/route.ts`: it currently hardcodes `subscription_status:'pending_approval', is_active:false`. Change so it NO LONGER forces those for a self-serve workspace. Simplest correct rule per the spec: this route is the WhatsApp-setup completion; it should set the WhatsApp creds + `onboarding_complete:true` but MUST NOT downgrade `subscription_status`/`is_active` (leave billing state to the billing flow). Remove the `subscription_status:'pending_approval', is_active:false` writes. (If some internal flow relied on that, gate it behind an explicit `internal` caller — but per spec the public flow must never enter pending_approval.)
- [ ] **Step 3:** `npx tsc --noEmit` clean. Commit `feat(onboarding): route incomplete workspaces to checkout; remove public approval dead-end`.

---

## Post-implementation (controller)
1. Apply migration 072 live.
2. Whole-branch review (opus): the state machine + gate routing are coherent (no dead-ends, no way to reach the dashboard unpaid, `pending_approval` only via admin path); email-OTP is hashed + attempt-capped + rate-limited; `signUp` unconfirmed change didn't break invite-accept (must stay pre-confirmed); billing chain untouched; cross-tenant safety on new endpoints.
3. **Live E2E** (payment stand-in until Razorpay live): signup → verify email (check the code arrives / read `email_otps`) → business details → workspace created `incomplete`+inactive → plan-select → **admin-activate the workspace** (stand-in for payment) → confirm the dashboard loads with a Connect-WhatsApp banner. Also: returning-user resumes at the right step; duplicate email 400; the gate routes each `subscription_status` correctly.
4. Merge → push → user redeploys. When Razorpay Live lands tomorrow, the payment step completes the flow with no code change.

## Self-Review
- **Spec coverage:** email_otps + state resolver (T1), OTP lib + verify/resend (T2), signup enforcement + re-enable (T3), business details + explicit state (T4), plan-select/checkout wizard (T5), gate rerouting + approval-deadend removal (T6). WhatsApp-not-a-hard-gate handled via `onboarding_complete=true` at creation (T4) + gate note (T6). Reused billing chain untouched. Admin path retained (only the public flow changes). All spec sections mapped.
- **Placeholders:** none — migration SQL, OTP crypto, state resolver, and gate logic are concrete; where a component path is uncertain (WorkspaceCreateForm, Billing-v2 CheckoutButton) the task says grep + names the exact thing to reuse.
- **Type consistency:** `resolveOnboardingStep`/`SELF_SERVE_INITIAL`/`OnboardingStep` (T1) used in T5/T6; `issueOtp`/`verifyOtp`/`generateOtp`/`hashOtp` (T2) used in T2/T3; `subscription_status='incomplete'` string identical across T1/T4/T5/T6.

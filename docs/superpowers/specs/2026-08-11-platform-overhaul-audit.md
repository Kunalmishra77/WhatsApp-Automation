# Platform Overhaul — Pre-Implementation Audit Report

**Date:** 2026-08-11
**Prepared for:** Master Product/Billing/Analytics/Dashboard Overhaul
**Method:** Four parallel read-only code audits + competitor analysis (combirds.com)

## Executive Summary

The overhaul is realistically **5 independent projects**, not one. Two findings reshape
the plan versus the original brief:

1. **Billing is ~70% already built** (an unfinished, un-activated Razorpay *subscription*
   skeleton), not greenfield — and it has a real disconnect bug that would prevent
   activation even with live keys. We complete/harden it, we do not start from zero.
2. **The "~1000 messages regardless of date" bug is a real PostgREST 1000-row cap**, fully
   root-caused, plus two adjacent bugs (conversations query ignores the date filter; a UTC
   "today" off-by-one). Small, isolated, high-impact fix — sequenced **first**.

Approved build order: **Project 0 (analytics + date foundation) → Project 1 (Razorpay
billing) → Project 2 (dashboard) → Project 3 (conversation filtering) → Project 4 (UX)**.

Approved product decisions: one plan (**₹2,999 = everything**) + **₹999 Instagram add-on**;
**self-serve** signup (pay → active, no mandatory manual approval); existing clients
**counted from 1 Aug 2026**, first expiry **1 Sept 2026**, all clients get a **recharge-style
reminder 3 days before expiry**.

## Existing Architecture (reusable)

- **Stack:** Next.js 15 App Router, TypeScript, Supabase Postgres (PostgREST, RLS
  deny-all + service-role RPCs), Vitest, recharts, Tailwind + shadcn/ui primitives
  (`components/ui/*`), Upstash Redis (rate-limit/cache/idempotency only — not a job queue),
  pg_cron + pg_net for scheduled jobs (Coolify deploy from GitHub main).
- **Auth/tenancy:** roles `super_admin|admin|manager|agent` (`types/auth.types.ts`);
  `requireWorkspacePermission(workspaceId, perm)` (`lib/authz.ts`) enforces
  `workspace_members`; `profiles.is_platform_admin` for platform staff (checked ad-hoc in
  ~15 admin routes — no shared helper). Every tenant table is `workspace_id`-scoped.
- **Infra to reuse:** `lib/mailer.ts` (Gmail SMTP → Resend fallback), `notifications` table
  + `useNotificationsList` (in-app), pg_cron→HTTP+`CRON_SECRET` pattern (`052_pg_cron_setup`,
  `063_meta_spend`), `lib/export-stream.ts` `paginateAll` (uncapped reads),
  `getRequiredSecret`/`cleanEnvValue` (`lib/supabase-env.ts`).

## Current Problems

- **Analytics accuracy:** 1000-row cap on message/contact/lead/conversation counts;
  conversations metrics ignore the date filter; UTC "today" off-by-one for IST. (Project 0.)
- **Billing:** checkout writes `stripe_subscription_id` but webhook reads
  `razorpay_subscription_id` (never reconcile); 3 disagreeing plan definitions; no webhook
  idempotency; no payment/event history table; no grace-period job; `is_active` enforced
  only in the dashboard layout — **not** at the API/webhook/cron layer (a "paused" tenant
  keeps working via direct API). (Project 1.)
- **Dashboard:** real data (21 parallel counts, 1 HTTP call) but no charts, no date picker.
  (Project 2.)
- **Conversations:** only status/channel tabs + client-side in-memory search; missing
  date/campaign/lead/assigned/unread filters; an unused GIN FTS index exists. (Project 3.)

## Razorpay Integration Requirements (Project 1 — deferred, captured here)

- **Exists:** `lib/razorpay-billing.ts` (plans, create/cancel sub, HMAC webhook verify —
  fetch-based, no SDK), `app/api/billing/razorpay-checkout`, `app/api/billing/razorpay-webhook`
  (activated/charged/failed/halted/cancelled), `BillingSettings` UI, suspension redirect
  pages (`/payment-required`, `/pending-approval`), admin override
  (`admin/workspaces/[id]`).
- **Missing:** `plans` table (single source of truth); `subscription_events` /
  `payments` / `invoices` audit tables; webhook idempotency (stored `event.id`); internal
  grace-period/dunning cron; **API-layer `is_active` enforcement**; centralized
  `requirePlatformAdmin()`; proration/plan-change; invoice/receipt UI; `.env.example`.
- **Do not conflate:** a *separate* per-workspace Razorpay integration exists for clients'
  own customers (payment links, `workspaces.settings.razorpay_key_id/secret`) — different
  money flow, different creds. Platform-subscription billing must not collide with it.
- **Vendor note:** verify current Razorpay Subscriptions API + webhook event names against
  live docs before implementing; keep all secret ops server-side; verify signatures.

## Subscription / Plan / Add-on Architecture (decided)

- **One plan model.** `plans` table with a single active client plan (`whatsapp`, ₹2,999/mo)
  + one add-on (`instagram`, ₹999/mo). Feature-gating collapses: everyone on the plan gets
  all WhatsApp features (CRM, Flows, KB, AI, analytics, campaigns); the add-on toggles the
  Instagram inbox. Remove the `hasFeature(plan, …)` tier gates.
- **Self-serve lifecycle:** signup → pick plan (+ optional add-on) → Razorpay checkout →
  webhook activates (`is_active=true`). Manual admin approval becomes an optional
  super-admin toggle, not a mandatory gate.

## Payment State Machine (decided)

`TRIAL?* → ACTIVE → PAST_DUE → GRACE_PERIOD → SUSPENDED → (REACTIVATED→ACTIVE)`, plus
`CANCELLED`. Each state maps to explicit access (ACTIVE/GRACE = full; SUSPENDED =
data preserved, access restricted to the pay-to-reactivate screen). **Data is never
deleted on suspension.** Enforcement must move to a shared gate covering dashboard **and**
API/webhook/cron (today only the dashboard layout checks `is_active`).

**Existing-client rule (approved):** anchor 1 Aug 2026 → first expiry 1 Sept 2026 →
recharge-style reminder 3 days before every expiry → on expiry, "subscription ended, pay to
restart" message → reactivation on payment. Grace-period length configurable by super-admin.

## Dashboard Audit (Project 2)

`app/(dashboard)/dashboard/page.tsx` + `/api/dashboard-stats` (21 `count:'exact'` queries
in one `Promise.all`). All real, no placeholders. Gaps: no charts, no date range, no
campaign performance (only `sent_count`), no lead-temperature breakdown. Agent role gets
`MyWorkDashboard`. Rebuild consumes the Project 0 date utility.

## Analytics Audit (Project 0 — see companion design doc)

Root cause + fix detailed in `2026-08-11-analytics-date-foundation-design.md`. Note an
orphaned, *correct* `modules/analytics/services/analytics.service.ts` (uses
`count:'exact'`, date-fns) exists but is unused — the live dashboard calls the buggy
`/api/analytics/overview|extended`.

## Data Accuracy Problems

Confirmed: the 1000-cap is a genuine query artifact, **not** a hardcoded placeholder (no
literal `1000`/mock data found anywhere in analytics). Fix the data layer (queries/RPCs),
not the displayed numbers.

## Conversation Filter Audit (Project 3)

Today: `status` tabs (all/mine/open/assigned/pending/resolved/spam), `channel` tabs
(all/whatsapp/instagram), client-side text search. Available-but-unexposed columns:
`assigned_agent_id`, `labels[]`, `unread_count`, `first_replied_at`, `sentiment`,
`is_spam`, `snoozed_until`. Missing: date quick-ranges (live list), campaign filter (needs
`campaign_recipients` join — no `campaign_id` on conversations), lead-temperature filter
(join to `leads`), unread/replied/unanswered, assigned-user dropdown, server-side search
(GIN FTS index `idx_conversations_fts` exists, unused).

## Data Model — Computable Metrics

- **messages:** `direction`, `status(queued|sent|delivered|read|failed)`, `delivered_at`,
  `read_at`, `created_at`, `workspace_id` → delivery/read/reply rates + funnel all
  computable (once un-capped).
- **campaigns:** pre-aggregated `sent/delivered/read/failed/replied_count` on the row (NOT
  1000-capped); `campaign_recipients` has per-recipient status + timestamps +
  `conversation_id` (the linkage key). `campaigns/[id]/daily-stats` already does per-day
  rollups — a good template.
- **leads:** `stage(new|contacted|follow_up|interested|converted|lost)`,
  `temperature(hot|warm|cold)`, `ai_score(unused)`. **Temperature is a message-count
  trigger heuristic (<4 cold / 4–7 warm / ≥8 hot), NOT LLM AI** — market accurately.
- **Instagram:** real 1:1 inbox (webhook + send + `instagram_accounts`), channel tab
  exists. **No campaign/broadcast support.** Sell as "unified WhatsApp + Instagram inbox",
  not "Instagram campaigns".

## Competitor Analysis (combirds.com)

Indian CPaaS (SMS/WhatsApp/RCS/Voice/Email), quote-gated pricing (no public numbers), AI
chatbot **"coming soon"**, no Instagram inbox, basic per-campaign delivery/read/click/reply
analytics only. Their packaged features: WhatsApp Catalogue/Pay commerce, in-chat
Forms/Webviews, click-to-WhatsApp ad tracking, attribute-based agent routing.
**Low-confidence areas:** exact pricing + product UX (behind JS/login — not directly seen).

**Our advantages to lean into:** live AI agent (theirs is roadmap), Instagram+WhatsApp
unified inbox, transparent flat pricing, Kanban CRM + lead temperature, deeper analytics
(post-fix), Meta-spend transparency.

## UX Gap Analysis

Adopt (adapt, don't copy): 3-state bot→human triage mental model; attribute-based routing.
Beat them on: pricing transparency, analytics depth, AI-native messaging, unified inbox,
docs/self-serve polish. Design-system primitives already exist (`components/ui/*`, recharts,
themed tokens) — rebuild on those, unify the duplicate `KpiCard`/`MetricCard` patterns.

## Database Changes (by project)

- P0: `064_analytics_aggregates.sql` (SECURITY DEFINER aggregation RPCs; no table/RLS change).
- P1: `plans`, `subscriptions`/`subscription_items`, `payments`, `payment_events`
  (idempotency), `invoices`; new `subscription_status` states; billing cron migration.
- P2/P3: likely denormalized `conversations.source_campaign_id` + index for fast campaign
  filtering; possible aggregate/materialized tables if dashboard load demands it.

## API / Background-Job / Security / Performance Changes

- **API:** fix analytics routes (P0); new billing routes + webhook idempotency (P1);
  conversation filter query params + server-side search (P3). Introduce shared
  `requirePlatformAdmin()`.
- **Jobs:** new pg_cron billing job (reminders 3-days-before, grace→suspend, reconciliation)
  following the `063_meta_spend` inlined-secret pattern.
- **Security:** move `is_active` enforcement to a shared gate across dashboard + API +
  webhook + cron; keep RLS deny-all + SECURITY DEFINER + REVOKE for new RPCs; verify all
  Razorpay signatures server-side; webhook idempotency prevents replay double-processing.
- **Performance:** server-side SQL aggregation over per-request 1000-row JS passes; parallel
  independent queries; cache stable data — never trade accuracy for speed.

## Implementation Roadmap

0. **Analytics + date foundation** (this sprint) — fix cap/date/timezone, ship
   `lib/date-range.ts` + aggregation RPCs. *Companion design doc approved.*
1. **Razorpay billing** — one-plan+add-on, `plans`/`payments`/`events` tables, state
   machine, self-serve checkout, grace + recharge-style reminders, API-layer suspension,
   super-admin revenue views, existing-client rule (1 Aug anchor).
2. **Dashboard rebuild** — KPI command center + charts on the date foundation.
3. **Conversation filtering + reporting** — date/campaign/lead/assigned/unread + FTS search.
4. **UX polish + competitor wins** — premium redesign, transparent-pricing/AI-native/unified-
   inbox positioning, analytics depth.

## Testing Plan (per project)

Unit (pure helpers — date ranges, billing math, state transitions), integration/live
(data-accuracy vs direct DB counts; sync/webhook idempotency against a real workspace),
security (cross-tenant 403; suspended-tenant API blocked), E2E (signup→pay→active→
dashboard→analytics→billing). Every project ends with a whole-branch review before merge.

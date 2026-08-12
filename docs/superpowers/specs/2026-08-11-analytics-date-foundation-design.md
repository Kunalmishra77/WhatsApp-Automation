# Analytics Accuracy + Global Date Foundation (Project 0)

**Date:** 2026-08-11
**Status:** Approved design, pending implementation plan
**Part of:** Platform-Wide Product/Billing/Analytics Overhaul (Project 0 of 5)

## Problem

The client Analytics page shows ~1,000 messages regardless of the selected range
(7/15/30 days all plateau at ~1000). Audit confirmed the root cause and two adjacent
bugs. This project fixes analytics accuracy AND ships the reusable, timezone-aware
date-range utility that the dashboard rebuild (Project 2) and conversation filtering
(Project 3) will both consume. It does NOT rebuild the dashboard or add conversation
filters — those are later projects.

## Root causes (verified in audit, do not re-derive)

1. **1000-row cap (the headline bug).** `app/api/analytics/overview/route.ts:21-28`
   does a bare `.select('created_at, direction, status, sender_type')` on `messages`,
   which PostgREST silently caps at **1000 rows** (`max-rows`), then sums in JS
   (`totalMessages = totalInbound + totalOutbound`, line ~170). So the total can never
   exceed 1000. The same capped-`.select()`-then-count-in-JS pattern recurs in ~10 more
   queries across `overview/route.ts` (contacts lines 62/79/131, conversations line 100)
   and `extended/route.ts` (leads 70, conversations 102, contacts 135, messages/delivery
   funnel 193) and the admin analytics routes (`admin/analytics/dashboard/route.ts:33`,
   `admin/analytics/client/[id]/route.ts:32` trend). The correct pattern already exists
   in the repo: `count:'exact', head:true` (used in `client/[id]/route.ts:29`) and
   `paginateAll` (`lib/export-stream.ts`).
2. **Conversations query ignores the date filter.** `overview/route.ts:100-103` selects
   conversations with only `.eq('workspace_id', …)` — no `.gte/.lte`. So
   `openConversations`, `resolvedConversations`, `avgResponseTimeMin`,
   `conversationsByStatus`, `resolutionTimeDistribution` are ALWAYS all-time, ignoring the
   range selector.
3. **Timezone off-by-one.** `AnalyticsDashboard/index.tsx:37-41` `buildDates()` uses
   `new Date().toISOString()` (UTC) to compute "today". For an IST client between local
   midnight and 05:30, "today" resolves to the previous UTC day, dropping messages from
   the true local day. All clients are Indian (INR, en-IN, IST used throughout).

## Decisions

1. **Reporting timezone = `Asia/Kolkata` (IST) by default**, since every client is Indian
   and the codebase already hardcodes `Asia/Kolkata`/`en-IN` for display in many places.
   The utility takes an optional `tz` param so a future per-workspace timezone (or WABA
   `timezone_id`, already fetched by meta-spend) can override without a rewrite.
2. **Aggregate in SQL, not JS.** Replace capped `.select()`-then-reduce with either
   `count:'exact', head:true` (pure counts) or a **Postgres aggregation RPC**
   (`GROUP BY date_trunc(...)`) for per-day / per-category / per-status breakdowns. This
   fixes both accuracy (no cap) and performance (§35) in one move. `paginateAll` is the
   fallback only where a genuine row-by-row pass is unavoidable.
3. **One date utility, reused everywhere.** Generalize the existing `resolveRange`
   (`lib/meta-spend.ts`) into `lib/date-range.ts`. Analytics migrates onto it now; later
   projects reuse it. Do not add a second date-filter implementation anywhere.

## The date utility — `lib/date-range.ts`

Pure functions, no I/O, fully unit-tested.

```
type QuickRange =
  | 'today' | 'yesterday'
  | 'last_7_days' | 'last_15_days' | 'last_30_days'
  | 'last_3_months' | 'last_6_months' | 'last_12_months'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'this_quarter' | 'last_quarter'
  | 'this_half_year' | 'last_half_year'
  | 'this_year' | 'last_year'
  | 'all_time'
  | 'custom';

interface DateRange {
  from: string;   // 'YYYY-MM-DD' — inclusive local calendar day (in tz)
  to: string;     // 'YYYY-MM-DD' — inclusive local calendar day (in tz)
  fromUtc: string; // ISO instant — inclusive lower bound for timestamptz queries
  toUtc: string;   // ISO instant — EXCLUSIVE upper bound (start of day AFTER `to`)
}

resolveRange(quick: QuickRange, opts?: { tz?: string; now?: Date; from?: string; to?: string }): DateRange
```

- **Timezone-correct boundaries.** "Today", week/month/quarter starts, etc. are computed
  against the wall-clock calendar in `tz` (default `Asia/Kolkata`), then converted to the
  correct UTC instants. `fromUtc`/`toUtc` are what queries use against `timestamptz`
  columns (`created_at`). `toUtc` is the **exclusive** start of the day after `to` (so
  `.gte(fromUtc).lt(toUtc)`), which avoids the `23:59:59.999` truncation bug in the
  current code (`…T23:59:59.999Z` drops the last millisecond and is UTC-naive).
- `all_time` → `fromUtc` = epoch (`'1970-01-01T00:00:00.000Z'`), `toUtc` = now+.
- `custom` → uses `opts.from`/`opts.to` as local calendar days in `tz`.
- Week starts **Monday** (matches existing `resolveRange`). Quarters = Jan/Apr/Jul/Oct.
  Half-year = Jan–Jun / Jul–Dec.
- A small helper `QUICK_RANGES: Array<{ key, label }>` drives filter dropdowns app-wide.

Implementation note: to convert a wall-clock day in a named tz to a UTC instant without a
tz library, use `Intl.DateTimeFormat(..., { timeZone })` to read the tz offset for the
target date and apply it (DST-agnostic is fine — IST has no DST; the helper stays correct
for any fixed-offset tz and is close enough for others, documented as such).

## Analytics engine fix

Rework the metric queries in `app/api/analytics/overview/route.ts`,
`app/api/analytics/extended/route.ts`, and the admin analytics routes so that:

- **Counts** (total messages, inbound, outbound, delivered, read, failed, replies, new
  contacts, leads by stage/temperature, conversations by status) use
  `count:'exact', head:true` with `.gte(fromUtc).lt(toUtc)` — never a capped `.select()`.
- **Time series & breakdowns** (messages per day, delivery funnel, sender split, status
  distribution, resolution-time buckets) come from **SQL aggregation RPCs** added in a
  new migration (`SECURITY DEFINER`, workspace-scoped, `GROUP BY date_trunc`), called with
  the resolved range. RPCs return already-bucketed rows so no >1000 JS pass is needed.
- **The conversations metrics get the date filter applied** (`.gte(fromUtc).lt(toUtc)` on
  `created_at`) — fixing the all-time bug. "Current-state" snapshots that are intentionally
  all-time (total contacts, tag distribution) stay all-time and are labeled as such.
- All boundaries come from `lib/date-range.ts` (timezone-correct), replacing the inline
  `…T00:00:00.000Z`/`…T23:59:59.999Z` strings.
- The route accepts either a `quick` range key or explicit `from`/`to`; it resolves via
  the utility server-side so client and server agree.

New RPCs live in a migration `064_analytics_aggregates.sql`. Each is `SECURITY DEFINER`,
takes `(p_workspace uuid, p_from timestamptz, p_to timestamptz)`, filters
`workspace_id = p_workspace`, and `REVOKE`s from public / grants to the service role — same
hardening pattern as prior migrations. No RLS change to base tables.

## Analytics UI

`modules/analytics/components/AnalyticsDashboard/index.tsx`:
- Replace bespoke `buildDates()` (7d/30d/90d only) with a date-range control driven by
  `QUICK_RANGES` from `lib/date-range.ts`: full quick set + custom from/to + all-time.
- The selected `quick` key (or custom from/to) is passed to `/api/analytics/*`; the server
  resolves the actual boundaries (single source of truth).
- No visual redesign in this project — just correct data + the fuller filter. (The premium
  redesign is Project 2/4.)

## Testing

- **Unit (`lib/date-range.ts`):** every quick range resolves to expected from/to/fromUtc/
  toUtc; IST "today" boundary (a 02:00 IST instant still lands on the correct local day);
  custom range; all_time; Monday week start; quarter/half boundaries; exclusive `toUtc`.
- **Data-accuracy (integration, against a real workspace):** for a workspace with >1000
  messages in range, the analytics total equals a direct `count:'exact'` from the DB (proves
  the cap is gone); totals change correctly across 7/15/30-day selections; conversations
  metrics respond to the range.
- **Regression:** a >1000-row scenario asserts total > 1000 (the exact failure that exists
  today).
- **No hardcoded values:** grep asserts no literal `1000`/mock data reintroduced.

## Multi-tenant security

Every analytics query and every new RPC is workspace-scoped (`workspace_id = …` /
`p_workspace`). Client routes keep `requireWorkspacePermission(workspaceId,'view_analytics')`.
RPCs are `SECURITY DEFINER` + `REVOKE`d from public (service-role only). No cross-tenant
surface added.

## Out of scope (later projects)

Dashboard rebuild (Project 2), conversation filters + server-side search (Project 3),
Razorpay billing (Project 1), UX redesign (Project 4). Project 0 only fixes analytics
correctness and delivers the shared date utility + aggregation RPC pattern.

## Rollout

Additive migration (`064_analytics_aggregates.sql` — new RPCs only, no table/RLS change),
applied live by the controller; code (utility + route fixes + UI) requires redeploy. No
existing table or metric semantics change except the three bug fixes (cap, conversations
date filter, timezone).

# Dashboard Rebuild — SaaS Command Center (Project 2)

**Date:** 2026-08-13
**Status:** Approved design pending user review, then implementation plan
**Part of:** Platform-Wide Product/Billing/Analytics Overhaul (Project 2 of 5)

## Problem

The client dashboard (`app/(dashboard)/dashboard/page.tsx` + `/api/dashboard-stats`) shows
real data but is KPI-cards-and-lists only: **no charts, no date filter** (fixed
today/week/month windows), no campaign performance (only `sent_count`), no lead-temperature
breakdown. It fires 21 count queries server-side per load. We rebuild it into a premium,
date-filterable **command center** that answers "what's happening in my business, how well is
it performing, and what changed over time?" — every number real, responding to a global date
filter, reusing the Project-0 date foundation + analytics RPCs. Agents keep their focused
"My Work" view unchanged.

## Decisions (from brainstorming)

1. **Rebuild the main dashboard** (owner/admin/manager); **agents keep `MyWorkDashboard`** as-is.
2. **Global date filter** on the whole dashboard — the full Project-0 quick-range set (today,
   yesterday, last 7/15/30 days, last 3/6/12 months, this/last week·month·quarter·half·year,
   this year, custom, all-time) via `lib/date-range.ts` `QUICK_RANGES`. Default **Last 30 Days**.
3. **Sections** (all computable from real data, all respond to the date filter): Message
   analytics, Campaign performance, Leads funnel (hot/warm/cold), Conversations, plus Bookings
   & Events and a headline KPI strip. Charts via **recharts** (existing lib).
4. **Reuse Project-0 foundation**: `lib/date-range.ts` (IST) + the migration-064 aggregation
   RPCs; add a small migration 067 only for campaign/conversation aggregates not yet covered.
5. **One aggregated API call**, not ~20 client calls — the route fans out server-side (parallel)
   and returns the whole dashboard payload, uncapped (no 1000-row bug), timezone-correct.

## Data source of truth (per metric — all real, uncapped, IST)

| Metric group | Source |
|---|---|
| Messages: total/inbound/outbound, per-day series, delivery/read/reply rates | migration-064 `analytics_message_daily` + `analytics_message_status` RPCs (IST buckets, outbound-scoped rates) |
| Campaigns: total/active/completed/failed/scheduled counts; sent/delivered/read/replied/failed totals; per-campaign bars | new RPC `analytics_campaign_totals` (sums pre-aggregated `campaigns.*_count` over the range, by status) + a bounded top-N recent campaigns query for the bar chart |
| Leads: total/new/hot/warm/cold/converted, stage funnel, conversion rate | migration-064 `analytics_lead_breakdown` RPC (stage × temperature) |
| Conversations: total/new/open/resolved/unanswered, by-status, avg response time | `analytics_conversation_status` RPC (ranged) + `count:'exact'` for new; new RPC `analytics_conversation_metrics` for resolved/avg-first-response |
| Contacts: total, new-in-period | `count:'exact', head:true` |
| Bookings & events | `conversation_events` grouped by `event_type` (existing dashboard pattern) |
| %-change vs previous period | compute previous equivalent window (same length, immediately before) and diff — same pattern as the Meta-Spend summary |

No metric uses a bare capped `.select()`. Campaign per-campaign bars are bounded (top-N by
sent/replies via `.order().limit()`); all totals come from `count:'exact'` or SQL-aggregation
RPCs.

## Migration 067 (additive RPCs only — no tables)

`SECURITY DEFINER`, `SET search_path=public`, `REVOKE`d from public/anon/authenticated
(service-role only), args `(p_workspace uuid, p_from timestamptz, p_to timestamptz)`,
`created_at >= p_from AND created_at < p_to` (exclusive upper — matches `lib/date-range.ts`):
- `analytics_campaign_totals(...)` → `TABLE(status text, campaigns bigint, recipients bigint,
  sent bigint, delivered bigint, read bigint, replied bigint, failed bigint)` — grouped by
  `campaigns.status`, summing the pre-aggregated per-campaign counters. (Uncapped campaign
  totals + status counts in one call.)
- `analytics_conversation_metrics(...)` → `TABLE(total bigint, resolved bigint,
  avg_first_response_secs numeric)` — total conversations created in range, resolved count,
  avg `EXTRACT(EPOCH FROM (first_replied_at - created_at))` where replied. (Response-time +
  resolution, uncapped.)

## API — `GET /api/dashboard/overview?workspaceId=&quick=&from=&to=`

Auth `requireWorkspacePermission(workspaceId,'view_analytics')` (owner/admin/manager hold it;
the page itself is role-gated so agents never reach it). Resolve the range server-side via
`resolveRange` (single source of truth). Fan out all queries/RPCs in parallel (`Promise.all`)
for the selected range AND the previous equivalent window (for %-change). Return one payload:

```
{
  range: { from, to },
  kpis: {                         // headline strip, each with value + pct_change vs prev period
    total_messages, total_conversations, new_leads, new_contacts,
    delivery_rate, read_rate, reply_rate, conversion_rate
  },
  messages: { sent, delivered, read, failed, replies, daily: [{label, inbound, outbound}] },
  campaigns: { total, active, completed, failed, scheduled,
               sent, delivered, read, replied, top: [{name, sent, replied}] },
  leads: { total, new, hot, warm, cold, converted, by_stage: [{stage, count}] },
  conversations: { total, new, open, resolved, unanswered, avg_first_response_mins,
                   by_status: [{status, count}] },
  events: [{ type, count }],
  currency_note?: ...            // (Meta-spend stays its own page; optional headline link only)
}
```

`runtime='nodejs'`. Workspace-scoped everywhere. `Number()`-coerce all RPC `bigint`s. No secrets.

## UI — `modules/dashboard/components/CommandCenter/*`

Rebuild the main dashboard (the non-agent branch of `app/(dashboard)/dashboard/page.tsx`):
- **Global date-range control** (top-right) from `QUICK_RANGES` + custom from/to + all-time —
  same control shipped on the Analytics page (Project 0). Changing it refetches the whole
  dashboard.
- **Headline KPI strip**: Messages, Conversations, New Leads, Delivery Rate, Reply Rate,
  Conversion Rate — each a card with the number + a %-change chip (green up / red down) vs the
  previous period.
- **Message analytics**: sent/delivered/read/failed/replies cards + a **messages-over-time
  area chart** (daily/weekly bucket by range) + delivery/read/reply rate gauges.
- **Campaign performance**: total/active/completed/failed/scheduled cards + a **campaign-wise
  bar chart** (top campaigns by sent, with replies).
- **Leads funnel**: total/new + hot/warm/cold breakdown + a **stage funnel/bar** + conversion
  rate. (Label temperature honestly — it's message-count-derived, not "AI-scored".)
- **Conversations**: total/new/open/resolved/unanswered + avg first-response time + a
  **by-status donut/bar**.
- **Bookings & Events**: the existing event-type cards (demo booked, callback, etc.).
- **Recent activity**: recent conversations + recent campaigns lists (kept from today's
  dashboard).
- Loading skeletons, empty states ("No data for this period"), error state with retry.
- **Responsive** (mobile/tablet/desktop): cards reflow, charts `max-width:100%` in
  `overflow-x:auto` containers. Reuse `Card`/`Badge`/`Button`/`Select` + the recharts theme/
  palette from `modules/analytics/components/AnalyticsDashboard`. Unify the duplicate
  `KpiCard`/`MetricCard` pattern into one shared card component.

## Performance

One API round-trip; server-side parallel fan-out; SQL aggregation (RPCs) over per-request
1000-row JS passes; the previous-period queries run in the same `Promise.all`. Cache stable
data client-side via the existing react-query pattern keyed on `quick`+custom. Never trade
accuracy for speed.

## Security / multi-tenant

Every query/RPC workspace-scoped; the route is `view_analytics`-gated; new RPCs are
`SECURITY DEFINER` + `REVOKE`d (service-role only). The page is role-gated so agents get
`MyWorkDashboard`, not this. No secrets in the payload.

## Testing

- **Unit**: %-change/previous-period math; any pure formatting helpers (rates, response-time).
  (Reuse `lib/date-range.ts` — already tested.)
- **Live data-accuracy** (controller, real workspace e.g. Umang/Razorveda): dashboard totals
  equal direct DB counts for the same range (proves uncapped); totals change correctly across
  Today/7d/30d/all-time; campaign totals match summed campaign counters; lead breakdown matches.
- **Security**: cross-tenant request → 403; new RPCs not client-callable; agent role → gets
  MyWork, not the command center.
- **Responsive**: no horizontal body scroll on mobile; charts scroll within their container.

## Rollout

Additive migration 067 (RPCs only) applied live by the controller; code (route + UI) requires
redeploy. No existing table/metric semantics change; `MyWorkDashboard` and `/api/dashboard-stats`
(if still used elsewhere) remain until fully superseded.

## Out of scope (later)

Conversation filtering + reporting (Project 3), UX polish pass (Project 4). Meta-spend keeps its
own page (optional headline link only). No new persisted aggregate tables (materialized views)
unless a live perf issue demands them.

# Dashboard Rebuild — Command Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the main client dashboard into a date-filterable SaaS command center — KPI strip + charts for messages/campaigns/leads/conversations/events — every number real, uncapped, IST-correct, in one API call. Agents keep `MyWorkDashboard`.

**Architecture:** New migration 067 (campaign + conversation aggregate RPCs) → one aggregated `GET /api/dashboard/overview` (server-side parallel fan-out, current + previous period for %-change) → a `CommandCenter` UI with the Project-0 global date filter + recharts. Reuses `lib/date-range.ts` + migration-064 RPCs.

**Tech Stack:** Next.js 15 routes, Supabase Postgres (RPC), TypeScript, Vitest, recharts, Tailwind. Builds on Project 0 (analytics/date foundation).

## Global Constraints

- **No metric via a bare capped `.select()`** — counts use `count:'exact', head:true`; per-day/status/category breakdowns use SQL-aggregation RPCs; campaign per-campaign bars use a bounded `.order().limit(top-N)`. Uncapped totals.
- **Date range resolved server-side** via `resolveRange` (`lib/date-range.ts`); boundaries `.gte(fromUtc).lt(toUtc)` (exclusive upper); IST. Default `last_30_days`.
- **Every query/RPC workspace-scoped**; route auth `requireWorkspacePermission(workspaceId,'view_analytics')`; new RPCs `SECURITY DEFINER` + `REVOKE`d (service-role only). `Number()`-coerce bigint. No secrets in payload.
- Amounts/counts from real data; empty period → `0`, never fabricated. Responsive (no horizontal body scroll; charts scroll within their own container).
- Windows: Bash tool for `npx tsc --noEmit`, `npx vitest run`, `git`. Do NOT run `npx next build`.

---

### Task 1: Migration 067 — campaign + conversation aggregate RPCs

**Files:** Create `database/migrations/067_dashboard_aggregates.sql`.

**Interfaces (Produces):** (all `SECURITY DEFINER SET search_path=public`, args `(p_workspace uuid, p_from timestamptz, p_to timestamptz)`, `created_at >= p_from AND created_at < p_to`)
- `analytics_campaign_totals(...)` → `TABLE(status text, campaigns bigint, recipients bigint, sent bigint, delivered bigint, read bigint, replied bigint, failed bigint)` — grouped by `campaigns.status`, summing the per-campaign counters.
- `analytics_conversation_metrics(...)` → `TABLE(total bigint, resolved bigint, avg_first_response_secs numeric)`.

- [ ] **Step 1: Write the migration**

```sql
-- 067_dashboard_aggregates.sql — SECURITY DEFINER aggregates for the command-center dashboard.
CREATE OR REPLACE FUNCTION public.analytics_campaign_totals(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(status text, campaigns bigint, recipients bigint, sent bigint, delivered bigint, read bigint, replied bigint, failed bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT status::text, count(*)::bigint,
         coalesce(sum(total_recipients),0)::bigint, coalesce(sum(sent_count),0)::bigint,
         coalesce(sum(delivered_count),0)::bigint, coalesce(sum(read_count),0)::bigint,
         coalesce(sum(replied_count),0)::bigint, coalesce(sum(failed_count),0)::bigint
  FROM public.campaigns
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY status;
$$;

CREATE OR REPLACE FUNCTION public.analytics_conversation_metrics(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(total bigint, resolved bigint, avg_first_response_secs numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE resolved_at IS NOT NULL)::bigint,
         avg(EXTRACT(EPOCH FROM (first_replied_at - created_at))) FILTER (WHERE first_replied_at IS NOT NULL)
  FROM public.conversations
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to;
$$;

DO $$ DECLARE fn text; BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'analytics_campaign_totals(uuid,timestamptz,timestamptz)',
    'analytics_conversation_metrics(uuid,timestamptz,timestamptz)'])
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon, authenticated;', fn); END LOOP;
END $$;
```

- [ ] **Step 2:** Verify column names exist (`campaigns.status/total_recipients/sent_count/delivered_count/read_count/replied_count/failed_count/created_at/workspace_id`; `conversations.resolved_at/first_replied_at/created_at/workspace_id`) via grep of `database/migrations/*.sql`. If any differ, STOP and report. No app test.
- [ ] **Step 3: Commit** `feat(dashboard): migration 067 — campaign + conversation aggregate RPCs`.

---

### Task 2: `GET /api/dashboard/overview` — aggregated, date-filterable

**Files:** Create `app/api/dashboard/overview/route.ts`.

**Interfaces (Consumes):** `resolveRange`, `QuickRange` (`lib/date-range.ts`); RPCs `analytics_message_daily`, `analytics_message_status`, `analytics_lead_breakdown`, `analytics_conversation_status` (migration 064), `analytics_campaign_totals`, `analytics_conversation_metrics` (migration 067).

**Interfaces (Produces):** payload (see spec):
```
{ range:{from,to}, kpis:{ total_messages, total_conversations, new_leads, new_contacts,
  delivery_rate, read_rate, reply_rate, conversion_rate, /* each: {value, pct_change} */ },
  messages:{sent,delivered,read,failed,replies, daily:[{label,inbound,outbound}]},
  campaigns:{total,active,completed,failed,scheduled, sent,delivered,read,replied, top:[{name,sent,replied}]},
  leads:{total,new,hot,warm,cold,converted, by_stage:[{stage,count}]},
  conversations:{total,new,open,resolved,unanswered, avg_first_response_mins, by_status:[{status,count}]},
  events:[{type,count}] }
```

- [ ] **Step 1:** `runtime='nodejs'`. Auth `requireWorkspacePermission(workspaceId,'view_analytics')` (`AuthzError`→`authzResponse`, 500 fallback). Parse `?quick=`/`?from=&to=` → `resolveRange` (default `last_30_days`). Compute the **previous equivalent window** (same length immediately before `fromUtc`) for %-change.
- [ ] **Step 2:** Fan out all queries/RPCs for BOTH windows in `Promise.all` (admin client — RPCs are service-role): message daily+status, lead breakdown, conversation status+metrics, campaign totals, new-contacts `count:'exact'`, events (`conversation_events` grouped by type). Build the payload; each KPI value + `pct_change = pctChange(current, previous)` (reuse the meta-spend `pctChange` helper or inline `((c-p)/p)*100`, null when p=0). Rates: delivery/read/reply outbound-scoped (delivered/read from status where direction=outbound — reuse the pattern from `analytics/overview`); conversion_rate = converted/total leads. `top` campaigns via a bounded `.order('sent_count',{ascending:false}).limit(6)` query. `avg_first_response_mins` = round(avg_first_response_secs/60).
- [ ] **Step 3:** `Number()` every bigint. Workspace-scoped everywhere. `npx tsc --noEmit` clean.
- [ ] **Step 4: Commit** `feat(dashboard): aggregated overview API (date-filterable, uncapped, %-change)`.

---

### Task 3: `CommandCenter` UI — KPI strip + message & campaign sections + date filter

**Files:** Create `modules/dashboard/components/CommandCenter/index.tsx` (+ a shared `KpiCard.tsx`, `SectionCard.tsx` as needed). Modify `app/(dashboard)/dashboard/page.tsx` to render `CommandCenter` for the non-agent branch (agents keep `MyWorkDashboard`).

**Interfaces (Consumes):** `QUICK_RANGES`, `QuickRange` (`lib/date-range.ts`); `/api/dashboard/overview` payload (Task 2). recharts.

- [ ] **Step 1:** In the dashboard page, keep the existing role check: agents → `MyWorkDashboard`; else → `CommandCenter`. `CommandCenter` uses `useWorkspaceStore((s)=>s.activeWorkspace?.id)`.
- [ ] **Step 2:** **Global date-range control** (top-right) from `QUICK_RANGES` + custom from/to + all-time (the same control shipped on the Analytics page — reuse its pattern). Fetch `/api/dashboard/overview?quick=…` (react-query keyed on `quick`+custom); refetch on change. Loading skeletons / empty ("No data for this period") / error+retry.
- [ ] **Step 3:** **Headline KPI strip**: Total Messages, Conversations, New Leads, Delivery Rate, Reply Rate, Conversion Rate — each a `KpiCard` with value + a %-change chip (green ↑ / red ↓ / grey — for null). Shared `KpiCard` (unify the duplicate MetricCard/KpiCard pattern).
- [ ] **Step 4:** **Message analytics** section: sent/delivered/read/failed/replies cards + a recharts **AreaChart** of `messages.daily` (inbound/outbound) + delivery/read/reply rate display.
- [ ] **Step 5:** **Campaign performance** section: total/active/completed/failed/scheduled cards + a recharts **BarChart** of `campaigns.top` (sent + replied per campaign).
- [ ] **Step 6:** Reuse `Card`/`Badge` + the recharts theme/palette from `modules/analytics/components/AnalyticsDashboard`. Responsive (grid reflow; charts in `overflow-x:auto`). `npx tsc --noEmit` clean.
- [ ] **Step 7: Commit** `feat(dashboard): command-center shell + date filter + KPI/message/campaign sections`.

---

### Task 4: `CommandCenter` — leads, conversations, events sections

**Files:** Modify `modules/dashboard/components/CommandCenter/index.tsx` (+ siblings).

**Interfaces (Consumes):** the same `/api/dashboard/overview` payload (leads, conversations, events).

- [ ] **Step 1:** **Leads funnel** section: total/new + hot/warm/cold/converted cards + a recharts **BarChart** funnel of `leads.by_stage` + conversion rate. Label temperature honestly ("activity-based", not "AI-scored").
- [ ] **Step 2:** **Conversations** section: total/new/open/resolved/unanswered cards + avg first-response time + a recharts **donut/bar** of `conversations.by_status`.
- [ ] **Step 3:** **Bookings & Events**: `events` cards by type (demo booked, callback, etc.). **Recent activity**: keep the recent-conversations + recent-campaigns lists from the current dashboard (fetch as today, or fold into the overview payload if trivial — otherwise leave the existing widgets).
- [ ] **Step 4:** Responsive; consistent styling. `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(dashboard): command-center leads/conversations/events sections`.

---

## Post-implementation (controller)

1. Apply migration 067 live.
2. **Live data-accuracy verification** (real workspace, e.g. Umang/Razorveda): dashboard `total_messages`/campaign totals/lead breakdown/conversation counts equal direct DB counts for the same range (proves uncapped); totals change correctly across Today/7d/30d/all-time; %-change sane.
3. Cross-tenant check: workspace A overview as a member of B → 403; new RPCs not client-callable; agent role → MyWork (not CommandCenter).
4. Whole-branch review (opus) → merge → push → tell user to redeploy.

## Self-Review

- **Spec coverage:** campaign+conversation RPCs (T1), aggregated overview API with %-change (T2), command-center shell + date filter + KPI/message/campaign sections (T3), leads/conversations/events (T4), live data-accuracy verification (controller). Agents keep MyWork (T3 Step 1). Responsive + reuse analytics theme (T3/T4). All spec sections mapped.
- **Placeholders:** none — RPC SQL, payload shape, and section contracts concrete.
- **Type consistency:** RPC names match migration 064/067; `resolveRange`/`QUICK_RANGES` from date-range; payload keys consistent between T2 (produce) and T3/T4 (consume).

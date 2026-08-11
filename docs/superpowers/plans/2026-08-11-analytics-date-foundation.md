# Analytics Accuracy + Global Date Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the analytics 1000-row cap, the conversations date-filter bug, and the UTC "today" off-by-one, and ship one reusable timezone-aware date-range utility (+ SQL aggregation RPCs) that later projects reuse.

**Architecture:** A pure `lib/date-range.ts` resolves quick/custom ranges to timezone-correct UTC boundaries. Analytics counts move to PostgREST `count:'exact'`; per-day/status breakdowns move to `SECURITY DEFINER` SQL aggregation RPCs (migration 064). The Analytics UI is rewired to the full quick-range set. No visual redesign, no new tables.

**Tech Stack:** Next.js 15 route handlers, Supabase Postgres (PostgREST + RPC), TypeScript, Vitest, recharts, Tailwind.

## Global Constraints

- Reporting timezone default = `Asia/Kolkata`; every range function takes an optional `tz` param. No tz library — use `Intl.DateTimeFormat`.
- No metric may use a bare `.select()` then count/aggregate in JS (PostgREST caps at 1000 rows). Use `count:'exact', head:true` for counts; aggregation RPCs for breakdowns; `paginateAll` only where unavoidable.
- Every analytics query and RPC is workspace-scoped (`workspace_id = …` / `p_workspace`). Client routes keep `requireWorkspacePermission(workspaceId,'view_analytics')`. RPCs are `SECURITY DEFINER`, `REVOKE`d from `public`/`anon`/`authenticated`.
- Date boundaries are `.gte(fromUtc).lt(toUtc)` (exclusive upper) — never the `…T23:59:59.999Z` string pattern.
- No hardcoded/placeholder metric values. Empty data → `0`, never a fabricated number.
- Windows: use the Bash tool for `npx tsc --noEmit`, `npx vitest run`, and `git`. Do NOT run `npx next build`.

---

### Task 1: `lib/date-range.ts` — timezone-aware date-range utility

**Files:**
- Create: `lib/date-range.ts`
- Test: `tests/date-range.test.ts`

**Interfaces:**
- Produces:
  - `type QuickRange = 'today'|'yesterday'|'last_7_days'|'last_15_days'|'last_30_days'|'last_3_months'|'last_6_months'|'last_12_months'|'this_week'|'last_week'|'this_month'|'last_month'|'this_quarter'|'last_quarter'|'this_half_year'|'last_half_year'|'this_year'|'last_year'|'all_time'|'custom'`
  - `interface DateRange { from: string; to: string; fromUtc: string; toUtc: string }` (`from`/`to` = inclusive local `YYYY-MM-DD`; `fromUtc` inclusive instant; `toUtc` EXCLUSIVE instant = start of day after `to`)
  - `resolveRange(quick: QuickRange, opts?: { tz?: string; now?: Date; from?: string; to?: string }): DateRange`
  - `QUICK_RANGES: ReadonlyArray<{ key: QuickRange; label: string }>` (drives dropdowns; excludes `custom`)
  - helpers (exported for tests): `todayInTz(now: Date, tz: string): string`, `addDays(dateStr: string, n: number): string`, `zonedDayStartUtc(dateStr: string, tz: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/date-range.test.ts
import { describe, it, expect } from 'vitest';
import { resolveRange, todayInTz, addDays, zonedDayStartUtc, QUICK_RANGES } from '@/lib/date-range';

const IST = 'Asia/Kolkata';

describe('helpers', () => {
  it('todayInTz maps a 02:00 IST instant to the correct local day', () => {
    // 2026-08-11T20:35Z == 2026-08-12T02:05 IST → local day is the 12th, not the 11th
    expect(todayInTz(new Date('2026-08-11T20:35:00Z'), IST)).toBe('2026-08-12');
    // 2026-08-11T18:00Z == 2026-08-11T23:30 IST → still the 11th
    expect(todayInTz(new Date('2026-08-11T18:00:00Z'), IST)).toBe('2026-08-11');
  });
  it('addDays does calendar math across month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('zonedDayStartUtc returns IST local midnight as the prior-day 18:30 UTC', () => {
    expect(zonedDayStartUtc('2026-08-12', IST)).toBe('2026-08-11T18:30:00.000Z');
  });
});

describe('resolveRange (IST)', () => {
  const now = new Date('2026-08-11T06:00:00Z'); // 2026-08-11 11:30 IST
  it('today', () => {
    const r = resolveRange('today', { tz: IST, now });
    expect(r.from).toBe('2026-08-11'); expect(r.to).toBe('2026-08-11');
    expect(r.fromUtc).toBe('2026-08-10T18:30:00.000Z');
    expect(r.toUtc).toBe('2026-08-11T18:30:00.000Z'); // exclusive
  });
  it('yesterday', () => {
    const r = resolveRange('yesterday', { tz: IST, now });
    expect(r.from).toBe('2026-08-10'); expect(r.to).toBe('2026-08-10');
  });
  it('last_7_days is 7 inclusive days ending today', () => {
    const r = resolveRange('last_7_days', { tz: IST, now });
    expect(r.from).toBe('2026-08-05'); expect(r.to).toBe('2026-08-11');
  });
  it('this_week starts Monday', () => {
    const r = resolveRange('this_week', { tz: IST, now }); // 2026-08-11 is a Tuesday
    expect(r.from).toBe('2026-08-10'); expect(r.to).toBe('2026-08-11');
  });
  it('last_week is the prior Mon–Sun', () => {
    const r = resolveRange('last_week', { tz: IST, now });
    expect(r.from).toBe('2026-08-03'); expect(r.to).toBe('2026-08-09');
  });
  it('this_month', () => {
    const r = resolveRange('this_month', { tz: IST, now });
    expect(r.from).toBe('2026-08-01'); expect(r.to).toBe('2026-08-11');
  });
  it('this_quarter (Q3 = Jul–Sep)', () => {
    const r = resolveRange('this_quarter', { tz: IST, now });
    expect(r.from).toBe('2026-07-01'); expect(r.to).toBe('2026-08-11');
  });
  it('this_half_year (H2 = Jul–Dec)', () => {
    const r = resolveRange('this_half_year', { tz: IST, now });
    expect(r.from).toBe('2026-07-01');
  });
  it('this_year', () => {
    const r = resolveRange('this_year', { tz: IST, now });
    expect(r.from).toBe('2026-01-01'); expect(r.to).toBe('2026-08-11');
  });
  it('all_time uses epoch → now+', () => {
    const r = resolveRange('all_time', { tz: IST, now });
    expect(r.fromUtc).toBe('1970-01-01T00:00:00.000Z');
    expect(new Date(r.toUtc).getTime()).toBeGreaterThan(now.getTime());
  });
  it('custom uses provided local days', () => {
    const r = resolveRange('custom', { tz: IST, now, from: '2026-07-01', to: '2026-07-31' });
    expect(r.from).toBe('2026-07-01'); expect(r.to).toBe('2026-07-31');
    expect(r.toUtc).toBe('2026-07-31T18:30:00.000Z'); // start of Aug 1 IST
  });
  it('QUICK_RANGES excludes custom and lists all quick keys', () => {
    expect(QUICK_RANGES.some(q => q.key === 'custom')).toBe(false);
    expect(QUICK_RANGES.length).toBeGreaterThanOrEqual(17);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run tests/date-range.test.ts`
Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Implement `lib/date-range.ts`**

```ts
// lib/date-range.ts — one timezone-aware date-range resolver reused across the app.
// No tz library: offsets come from Intl.DateTimeFormat. Correct for fixed-offset zones
// (IST has no DST); documented as approximate at DST transitions for other zones.

export type QuickRange =
  | 'today' | 'yesterday'
  | 'last_7_days' | 'last_15_days' | 'last_30_days'
  | 'last_3_months' | 'last_6_months' | 'last_12_months'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'this_quarter' | 'last_quarter'
  | 'this_half_year' | 'last_half_year'
  | 'this_year' | 'last_year'
  | 'all_time' | 'custom';

export interface DateRange { from: string; to: string; fromUtc: string; toUtc: string }

const DEFAULT_TZ = 'Asia/Kolkata';

export const QUICK_RANGES: ReadonlyArray<{ key: QuickRange; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7_days', label: 'Last 7 Days' },
  { key: 'last_15_days', label: 'Last 15 Days' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'last_3_months', label: 'Last 3 Months' },
  { key: 'last_6_months', label: 'Last 6 Months' },
  { key: 'last_12_months', label: 'Last 12 Months' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'last_quarter', label: 'Last Quarter' },
  { key: 'this_half_year', label: 'This Half-Year' },
  { key: 'last_half_year', label: 'Last Half-Year' },
  { key: 'this_year', label: 'This Year' },
  { key: 'last_year', label: 'Last Year' },
  { key: 'all_time', label: 'All Time' },
];

export function todayInTz(now: Date, tz: string): string {
  // en-CA → 'YYYY-MM-DD'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// Calendar arithmetic on a 'YYYY-MM-DD' string via a UTC-noon anchor (DST-safe for date math).
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// UTC instant of local 00:00 of `dateStr` in `tz`, using the tz's offset for that date.
export function zonedDayStartUtc(dateStr: string, tz: string): string {
  const asIfUtc = new Date(dateStr + 'T00:00:00.000Z');
  const tzWall = new Date(asIfUtc.toLocaleString('en-US', { timeZone: tz }));
  const utcWall = new Date(asIfUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = tzWall.getTime() - utcWall.getTime();
  return new Date(asIfUtc.getTime() - offsetMs).toISOString();
}

function parts(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}
function firstOfMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function resolveRange(
  quick: QuickRange,
  opts: { tz?: string; now?: Date; from?: string; to?: string } = {},
): DateRange {
  const tz = opts.tz || DEFAULT_TZ;
  const now = opts.now || new Date();
  const today = todayInTz(now, tz);
  const { y, m } = parts(today);

  let from = today, to = today;

  switch (quick) {
    case 'today': break;
    case 'yesterday': from = to = addDays(today, -1); break;
    case 'last_7_days': from = addDays(today, -6); break;
    case 'last_15_days': from = addDays(today, -14); break;
    case 'last_30_days': from = addDays(today, -29); break;
    case 'last_3_months': from = addDays(today, -89); break;
    case 'last_6_months': from = addDays(today, -179); break;
    case 'last_12_months': from = addDays(today, -364); break;
    case 'this_week': {
      const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0=Sun..6=Sat
      from = addDays(today, -((dow + 6) % 7)); // Monday
      break;
    }
    case 'last_week': {
      const dow = new Date(today + 'T12:00:00Z').getUTCDay();
      const thisMon = addDays(today, -((dow + 6) % 7));
      from = addDays(thisMon, -7); to = addDays(thisMon, -1); break;
    }
    case 'this_month': from = firstOfMonth(y, m); break;
    case 'last_month': {
      const pm = m === 1 ? 12 : m - 1; const py = m === 1 ? y - 1 : y;
      from = firstOfMonth(py, pm); to = addDays(firstOfMonth(y, m), -1); break;
    }
    case 'this_quarter': { const qs = Math.floor((m - 1) / 3) * 3 + 1; from = firstOfMonth(y, qs); break; }
    case 'last_quarter': {
      const qs = Math.floor((m - 1) / 3) * 3 + 1;
      const lqs = qs === 1 ? 10 : qs - 3; const lqy = qs === 1 ? y - 1 : y;
      from = firstOfMonth(lqy, lqs); to = addDays(firstOfMonth(y, qs), -1); break;
    }
    case 'this_half_year': from = firstOfMonth(y, m <= 6 ? 1 : 7); break;
    case 'last_half_year': {
      if (m <= 6) { from = firstOfMonth(y - 1, 7); to = `${y - 1}-12-31`; }
      else { from = firstOfMonth(y, 1); to = `${y}-06-30`; }
      break;
    }
    case 'this_year': from = firstOfMonth(y, 1); break;
    case 'last_year': from = `${y - 1}-01-01`; to = `${y - 1}-12-31`; break;
    case 'all_time':
      return { from: '1970-01-01', to, fromUtc: '1970-01-01T00:00:00.000Z', toUtc: zonedDayStartUtc(addDays(today, 1), tz) };
    case 'custom':
      from = opts.from || today; to = opts.to || today; break;
  }

  return { from, to, fromUtc: zonedDayStartUtc(from, tz), toUtc: zonedDayStartUtc(addDays(to, 1), tz) };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run tests/date-range.test.ts` → Expected: PASS (all).
Then `npx tsc --noEmit` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/date-range.ts tests/date-range.test.ts
git commit -m "feat(analytics): timezone-aware date-range utility (lib/date-range.ts)"
```

---

### Task 2: Migration 064 — analytics aggregation RPCs

**Files:**
- Create: `database/migrations/064_analytics_aggregates.sql`

**Interfaces:**
- Produces (all `SECURITY DEFINER`, args `(p_workspace uuid, p_from timestamptz, p_to timestamptz)` unless noted; `p_to` treated as EXCLUSIVE):
  - `analytics_message_daily(...)` → `TABLE(day date, direction text, cnt bigint)`
  - `analytics_message_status(...)` → `TABLE(status text, cnt bigint)`
  - `analytics_message_heatmap(p_workspace uuid, p_from timestamptz, p_to timestamptz, p_tz text)` → `TABLE(dow int, hour int, cnt bigint)`
  - `analytics_conversation_status(...)` → `TABLE(status text, cnt bigint)`
  - `analytics_lead_breakdown(...)` → `TABLE(stage text, temperature text, cnt bigint)`

- [ ] **Step 1: Write the migration**

```sql
-- 064_analytics_aggregates.sql — SECURITY DEFINER aggregation RPCs for analytics.
-- Eliminates the PostgREST 1000-row cap by aggregating in SQL. Workspace-scoped.
-- p_from inclusive, p_to EXCLUSIVE (matches lib/date-range.ts fromUtc/toUtc).

CREATE OR REPLACE FUNCTION public.analytics_message_daily(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(day date, direction text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (created_at)::date AS day, direction, count(*)::bigint
  FROM public.messages
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY 1, 2 ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.analytics_message_status(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT status, count(*)::bigint FROM public.messages
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.analytics_message_heatmap(
  p_workspace uuid, p_from timestamptz, p_to timestamptz, p_tz text)
RETURNS TABLE(dow int, hour int, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXTRACT(DOW FROM created_at AT TIME ZONE p_tz)::int AS dow,
         EXTRACT(HOUR FROM created_at AT TIME ZONE p_tz)::int AS hour,
         count(*)::bigint
  FROM public.messages
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY 1, 2;
$$;

CREATE OR REPLACE FUNCTION public.analytics_conversation_status(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT status, count(*)::bigint FROM public.conversations
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.analytics_lead_breakdown(
  p_workspace uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(stage text, temperature text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT stage::text, temperature, count(*)::bigint FROM public.leads
  WHERE workspace_id = p_workspace AND created_at >= p_from AND created_at < p_to
  GROUP BY 1, 2;
$$;

-- Lock down: service-role only (routes call with the admin client).
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'analytics_message_daily(uuid,timestamptz,timestamptz)',
    'analytics_message_status(uuid,timestamptz,timestamptz)',
    'analytics_message_heatmap(uuid,timestamptz,timestamptz,text)',
    'analytics_conversation_status(uuid,timestamptz,timestamptz)',
    'analytics_lead_breakdown(uuid,timestamptz,timestamptz)'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon, authenticated;', fn);
  END LOOP;
END $$;
```

- [ ] **Step 2: Verify SQL parses (dry check)**

The controller applies this live against Postgres (like migration 063). For the task, confirm the file is syntactically consistent (matching arg lists in the REVOKE block to the definitions) by re-reading it. No app test here.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/064_analytics_aggregates.sql
git commit -m "feat(analytics): SQL aggregation RPCs (migration 064) to kill the 1000-row cap"
```

---

### Task 3: Fix `app/api/analytics/overview/route.ts`

**Files:**
- Modify: `app/api/analytics/overview/route.ts`

**Interfaces:**
- Consumes: `resolveRange` (Task 1); RPCs `analytics_message_daily`, `analytics_message_status`, `analytics_message_heatmap`, `analytics_conversation_status` (Task 2).
- Produces: same JSON response shape as today (`summary`, `dailyMessages`, `messagesByHour`, `conversationsByStatus`, `resolutionTimeDistribution`, etc.) — only the values become correct.

- [ ] **Step 1: Read the current route** and note every place that does `db.from('messages'|'contacts'|'conversations').select(...)` then reduces in JS (audit: lines 21, 62, 79, 100, 131) and every `…T00:00:00.000Z`/`…T23:59:59.999Z` string.

- [ ] **Step 2: Replace range parsing** — accept `?quick=` OR `?from=&to=`; resolve server-side:

```ts
import { resolveRange, type QuickRange } from '@/lib/date-range';
// ...
const url = new URL(req.url);
const quick = (url.searchParams.get('quick') || 'last_30_days') as QuickRange;
const range = resolveRange(quick, {
  from: url.searchParams.get('from') || undefined,
  to: url.searchParams.get('to') || undefined,
});
const { fromUtc, toUtc } = range;
```

- [ ] **Step 3: Replace capped message aggregation** with RPC calls (no more `msgRaw` array):

```ts
const [{ data: daily }, { data: statuses }, { data: heat }] = await Promise.all([
  db.rpc('analytics_message_daily', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc }),
  db.rpc('analytics_message_status', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc }),
  db.rpc('analytics_message_heatmap', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc, p_tz: 'Asia/Kolkata' }),
]);
const totalInbound = (daily ?? []).filter(r => r.direction === 'inbound').reduce((a, r) => a + Number(r.cnt), 0);
const totalOutbound = (daily ?? []).filter(r => r.direction !== 'inbound').reduce((a, r) => a + Number(r.cnt), 0);
// build dailyMessages[] and messagesByHour[] from `daily` and `heat` (already bucketed, uncapped)
```

- [ ] **Step 4: Add the date filter to the conversations metrics** via the RPC (fixes the all-time bug):

```ts
const { data: convStatus } = await db.rpc('analytics_conversation_status',
  { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc });
// derive openConversations / resolvedConversations / conversationsByStatus from convStatus
```
Any resolution-time / first-response metric that needs row data must use `paginateAll` over the ranged rows (not a bare select). Snapshot metrics that are intentionally all-time (total contacts, tag distribution) stay all-time and keep a comment saying so.

- [ ] **Step 5: Delivery/read rates from `analytics_message_status`:**

```ts
const byStatus = Object.fromEntries((statuses ?? []).map(r => [r.status, Number(r.cnt)]));
const delivered = (byStatus.delivered ?? 0) + (byStatus.read ?? 0); // read implies delivered
const read = byStatus.read ?? 0;
const sentTotal = totalOutbound || 1;
const deliveryRate = Math.round((delivered / sentTotal) * 100);
const readRate = Math.round((read / sentTotal) * 100);
```

- [ ] **Step 6: New-contacts count via `count:'exact'`** (audit line 62 pattern):

```ts
const { count: newContacts } = await db.from('contacts')
  .select('id', { count: 'exact', head: true })
  .eq('workspace_id', workspaceId).gte('created_at', fromUtc).lt('created_at', toUtc);
```

- [ ] **Step 7: `npx tsc --noEmit`** → clean. Manually sanity-check the JSON shape is unchanged (keys the UI reads still present).

- [ ] **Step 8: Commit**

```bash
git add app/api/analytics/overview/route.ts
git commit -m "fix(analytics): overview uses count/RPC aggregation + ranged conversations (no 1000 cap)"
```

---

### Task 4: Fix `app/api/analytics/extended/route.ts` + admin analytics routes

**Files:**
- Modify: `app/api/analytics/extended/route.ts`
- Modify: `app/api/admin/analytics/dashboard/route.ts`
- Modify: `app/api/admin/analytics/client/[id]/route.ts`

**Interfaces:**
- Consumes: `resolveRange` (Task 1); RPCs `analytics_message_daily`, `analytics_message_status`, `analytics_lead_breakdown` (Task 2).

- [ ] **Step 1:** In `extended/route.ts`, replace capped selects (audit lines 70 leads, 102 conversations, 135 contacts, 193 messages/delivery-funnel) with: leads → `analytics_lead_breakdown`; delivery funnel → `analytics_message_status`; sentiment/temperature snapshots → `count:'exact'` per bucket or an RPC if a breakdown is needed. Use `fromUtc/toUtc` from `resolveRange`.

- [ ] **Step 2:** In `admin/analytics/dashboard/route.ts` (audit line 33) replace the platform-wide `messages` select + JS `.length`/`.filter` with `count:'exact'` for `messages_this_month` and `analytics_message_daily` summed across the range for the 6-month trend. Keep the platform-admin gate untouched.

- [ ] **Step 3:** In `admin/analytics/client/[id]/route.ts` (audit line 32) replace the uncapped 30-day `message_trend` select with `analytics_message_daily`. The top-line `messages_this_month` already uses `count:'exact'` — leave it.

- [ ] **Step 4:** `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/analytics/extended/route.ts app/api/admin/analytics/dashboard/route.ts app/api/admin/analytics/client/[id]/route.ts
git commit -m "fix(analytics): extended + admin analytics use count/RPC aggregation (no 1000 cap)"
```

---

### Task 5: Wire the global date filter into the Analytics UI

**Files:**
- Modify: `modules/analytics/components/AnalyticsDashboard/index.tsx`

**Interfaces:**
- Consumes: `QUICK_RANGES`, `QuickRange` (Task 1); the `?quick=`/`?from=&to=` API contract (Tasks 3–4).

- [ ] **Step 1:** Remove `buildDates()` (lines ~37-41). Add state `const [quick, setQuick] = useState<QuickRange>('last_30_days')` plus optional custom `from`/`to` state.

- [ ] **Step 2:** Render a date-range control from `QUICK_RANGES` (a `Select` from `components/ui/select`) + a custom from/to (two `Input type=date`, shown when `quick === 'custom'`). Match existing dashboard control styling; no redesign.

- [ ] **Step 3:** Change the fetch calls to pass the selection:

```ts
const qs = quick === 'custom'
  ? `?quick=custom&from=${customFrom}&to=${customTo}`
  : `?quick=${quick}`;
// fetch(`/api/analytics/overview${qs}`) and `/api/analytics/extended${qs}`
```
Re-fetch when `quick`/custom change (existing `useEffect` dep pattern).

- [ ] **Step 4:** `npx tsc --noEmit` → clean. Confirm the KPI cards + charts still read the same response keys (Task 3 kept the shape).

- [ ] **Step 5: Commit**

```bash
git add modules/analytics/components/AnalyticsDashboard/index.tsx
git commit -m "feat(analytics): full quick-range + custom date filter on the Analytics page"
```

---

## Post-implementation (controller)

1. Apply migration `064_analytics_aggregates.sql` live (service-role, like 063).
2. **Live data-accuracy verification** against a real workspace with >1000 messages
   (e.g. Razorveda): assert `overview` total == direct `count:'exact'` from `messages` for
   the same range (proves cap gone); assert totals differ correctly across 7/15/30-day;
   assert conversations metrics respond to range; assert an IST-boundary "today" is correct.
3. Cross-tenant check: workspace A range as a member of B → 403 (unchanged gate).
4. Whole-branch review (opus) → merge to main → push → tell user to redeploy.

## Self-Review

- **Spec coverage:** date utility (Task 1 ✓), aggregation RPCs (Task 2 ✓), overview fix incl.
  conversations date filter + timezone (Task 3 ✓), extended + admin fixes (Task 4 ✓), UI full
  filter (Task 5 ✓), tests (Task 1 unit + controller live verification ✓), security/workspace
  scoping (Global Constraints + RPC REVOKE ✓). No spec item unmapped.
- **Placeholders:** none — utility + RPC SQL + route transforms are concrete.
- **Type consistency:** `resolveRange`/`DateRange`/`QuickRange`/`QUICK_RANGES` names match across
  Tasks 1/3/4/5; RPC names match between Task 2 definitions and Task 3/4 calls; `p_to` exclusive
  matches `toUtc` exclusive everywhere.

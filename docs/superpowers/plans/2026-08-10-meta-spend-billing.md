# Meta Spend & Billing Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client-facing Meta Spend & Billing module showing real Meta-reported spend (per day, per pricing category) with date filters, chart, breakdown, history, export, and refresh — plus a super-admin global view — fed by a daily idempotent sync from Meta's `pricing_analytics`.

**Architecture:** Pure helpers (date ranges, aggregation, day-bucketing, response parsing) → a sync service that upserts `meta_spend_daily` from Meta → permission-gated client API that reads only local data → a dashboard (recharts). Financial tables are excluded from campaign cleanup.

**Tech Stack:** Next.js 15 route handlers, TypeScript, Vitest, Supabase Postgres (+ pg_cron), `lib/export-stream.ts`, recharts, React.

## Global Constraints

- **Source of truth:** Meta `GET /{waba_id}/pricing_analytics` (`granularity=DAILY`, `dimensions=["PRICING_CATEGORY"]`, `start`/`end` unix seconds, `access_token`). Response: `data[0].data_points[] = { start, end, pricing_category, volume, cost }`. Show these figures as **"Meta Reported Spend"** — never fabricate; **no campaign attribution**.
- **Currency/timezone:** from `GET /{waba_id}?fields=currency,timezone_id` — store currency per row; never hardcode INR; never alter the Meta amount.
- **Day bucketing:** `day = UTC date of (start + (end - start)/2)` (bucket midpoint) → stable YYYY-MM-DD.
- **Idempotent:** upsert into `meta_spend_daily` on `(workspace_id, day, category)` — re-sync never double-counts; always reflects Meta's latest restatement. Sync window = rolling last 35 days.
- **Tenant isolation:** every query filters `workspace_id`; tables are RLS deny-all (service-role only); API gated by `requireWorkspacePermission(workspaceId, 'view_analytics')`. Tokens stay server-side.
- **Financial retention:** `meta_spend_daily` / `meta_spend_sync` are NEVER deleted by campaign-retention cleanup.
- Cron is pure HTTP (`net.http_post` to `/api/cron/meta-spend-sync` with the inlined `CRON_SECRET`, like the reply-sweep job). Route auth: `Authorization: Bearer <CRON_SECRET>`.
- Reuse `lib/export-stream.ts` for export; reuse **recharts** (already a dependency) for the chart.
- **Read routes must load `meta_spend_daily` rows via `paginateAll` (from `@/lib/export-stream`), NOT a single `.select()`** — otherwise PostgREST's 1000-row cap silently truncates a workspace with lots of history and undercounts totals. Aggregate the paged rows with the Task-1 helpers.
- Use `(db as any)` where new columns/tables aren't in generated types.
- Commit after each task (Conventional Commit; end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

---

### Task 1: Pure billing helpers (`lib/meta-spend.ts`)

**Files:**
- Create: `lib/meta-spend.ts`
- Test: `tests/meta-spend.test.ts`

**Interfaces:**
- Produces:
  - `interface SpendRow { day: string; category: string; volume: number; cost: number; currency: string }`
  - `dayFromBucket(startSec: number, endSec: number): string` — YYYY-MM-DD (UTC date of midpoint)
  - `parsePricingAnalytics(json: unknown, currency: string): Array<{ day: string; category: string; volume: number; cost: number; currency: string }>`
  - `resolveRange(quick: string, now: Date): { from: string; to: string }` — YYYY-MM-DD inclusive, UTC calendar
  - `sumCost(rows: SpendRow[], from: string, to: string): number`
  - `pctChange(current: number, previous: number): number | null` — null when previous is 0
  - `bucketSeries(rows: SpendRow[], from: string, to: string, bucket: 'day'|'week'|'month'): Array<{ label: string; cost: number }>`

- [ ] **Step 1: Write the failing test**

Create `tests/meta-spend.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { dayFromBucket, parsePricingAnalytics, resolveRange, sumCost, pctChange, bucketSeries } from '../lib/meta-spend';

describe('dayFromBucket', () => {
  it('uses the bucket midpoint UTC date', () => {
    // an IST-midnight bucket: 2026-08-01 00:00 IST = 2026-07-31 18:30 UTC; +12h midpoint = 2026-08-01 06:30 UTC
    const start = Math.floor(Date.parse('2026-07-31T18:30:00Z') / 1000);
    const end = start + 24 * 3600;
    expect(dayFromBucket(start, end)).toBe('2026-08-01');
  });
});

describe('parsePricingAnalytics', () => {
  it('normalizes data points to rows', () => {
    const json = { data: [{ data_points: [
      { start: Math.floor(Date.parse('2026-08-01T00:00:00Z')/1000), end: Math.floor(Date.parse('2026-08-02T00:00:00Z')/1000), pricing_category: 'MARKETING', volume: 100, cost: 58.5 },
    ] }] };
    const rows = parsePricingAnalytics(json, 'INR');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'MARKETING', volume: 100, cost: 58.5, currency: 'INR' });
    expect(rows[0]!.day).toBe('2026-08-01');
  });
  it('returns [] for malformed input', () => {
    expect(parsePricingAnalytics({}, 'INR')).toEqual([]);
    expect(parsePricingAnalytics({ data: [{}] }, 'INR')).toEqual([]);
  });
});

describe('resolveRange', () => {
  const now = new Date('2026-08-10T09:00:00Z');
  it('today', () => expect(resolveRange('today', now)).toEqual({ from: '2026-08-10', to: '2026-08-10' }));
  it('yesterday', () => expect(resolveRange('yesterday', now)).toEqual({ from: '2026-08-09', to: '2026-08-09' }));
  it('last_7_days', () => expect(resolveRange('last_7_days', now)).toEqual({ from: '2026-08-04', to: '2026-08-10' }));
  it('this_month', () => expect(resolveRange('this_month', now)).toEqual({ from: '2026-08-01', to: '2026-08-10' }));
  it('unknown falls back to last_30_days', () => expect(resolveRange('nonsense', now)).toEqual({ from: '2026-07-12', to: '2026-08-10' }));
});

describe('sumCost / pctChange', () => {
  const rows = [
    { day: '2026-08-01', category: 'MARKETING', volume: 1, cost: 10, currency: 'INR' },
    { day: '2026-08-02', category: 'UTILITY', volume: 1, cost: 5, currency: 'INR' },
    { day: '2026-08-05', category: 'MARKETING', volume: 1, cost: 20, currency: 'INR' },
  ];
  it('sums within an inclusive range', () => {
    expect(sumCost(rows, '2026-08-01', '2026-08-02')).toBe(15);
    expect(sumCost(rows, '2026-08-01', '2026-08-05')).toBe(35);
  });
  it('pctChange handles zero previous', () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(15, 10)).toBe(50);
  });
});

describe('bucketSeries', () => {
  const rows = [
    { day: '2026-08-01', category: 'MARKETING', volume: 1, cost: 10, currency: 'INR' },
    { day: '2026-08-01', category: 'UTILITY', volume: 1, cost: 5, currency: 'INR' },
    { day: '2026-08-02', category: 'MARKETING', volume: 1, cost: 7, currency: 'INR' },
  ];
  it('buckets by day, summing categories', () => {
    const s = bucketSeries(rows, '2026-08-01', '2026-08-02', 'day');
    expect(s).toEqual([{ label: '2026-08-01', cost: 15 }, { label: '2026-08-02', cost: 7 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/meta-spend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/meta-spend.ts`:

```typescript
// lib/meta-spend.ts — pure helpers for the Meta Spend module. No I/O.

export interface SpendRow { day: string; category: string; volume: number; cost: number; currency: string }

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => iso(new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS));

export function dayFromBucket(startSec: number, endSec: number): string {
  const midMs = (startSec + (endSec - startSec) / 2) * 1000;
  return new Date(midMs).toISOString().slice(0, 10);
}

export function parsePricingAnalytics(
  json: unknown,
  currency: string,
): Array<{ day: string; category: string; volume: number; cost: number; currency: string }> {
  const points = (json as any)?.data?.[0]?.data_points;
  if (!Array.isArray(points)) return [];
  const out: Array<{ day: string; category: string; volume: number; cost: number; currency: string }> = [];
  for (const p of points) {
    if (typeof p?.start !== 'number' || typeof p?.end !== 'number') continue;
    out.push({
      day: dayFromBucket(p.start, p.end),
      category: String(p.pricing_category ?? 'UNKNOWN'),
      volume: Number(p.volume ?? 0),
      cost: Number(p.cost ?? 0),
      currency,
    });
  }
  return out;
}

export function resolveRange(quick: string, now: Date): { from: string; to: string } {
  const today = iso(now);
  const startOfWeek = (d: Date) => { const x = new Date(d); const dow = (x.getUTCDay() + 6) % 7; return addDays(iso(x), -dow); }; // Monday
  const startOfMonth = (d: Date) => iso(d).slice(0, 8) + '01';
  switch (quick) {
    case 'today':      return { from: today, to: today };
    case 'yesterday':  return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'last_7_days':  return { from: addDays(today, -6), to: today };
    case 'this_week':  return { from: startOfWeek(now), to: today };
    case 'last_week':  { const s = addDays(startOfWeek(now), -7); return { from: s, to: addDays(s, 6) }; }
    case 'this_month': return { from: startOfMonth(now), to: today };
    case 'last_month': { const first = startOfMonth(now); const lastPrevEnd = addDays(first, -1); return { from: lastPrevEnd.slice(0, 8) + '01', to: lastPrevEnd }; }
    case 'last_90_days': return { from: addDays(today, -89), to: today };
    case 'this_year':  return { from: iso(now).slice(0, 4) + '-01-01', to: today };
    case 'last_30_days':
    default:           return { from: addDays(today, -29), to: today };
  }
}

export function sumCost(rows: SpendRow[], from: string, to: string): number {
  let t = 0;
  for (const r of rows) if (r.day >= from && r.day <= to) t += r.cost;
  return Math.round(t * 10000) / 10000;
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function bucketSeries(
  rows: SpendRow[], from: string, to: string, bucket: 'day' | 'week' | 'month',
): Array<{ label: string; cost: number }> {
  const key = (day: string) => {
    if (bucket === 'month') return day.slice(0, 7);
    if (bucket === 'week') { const dow = (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7; return addDays(day, -dow); }
    return day;
  };
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.day < from || r.day > to) continue;
    const k = key(r.day);
    map.set(k, (map.get(k) ?? 0) + r.cost);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, cost]) => ({ label, cost: Math.round(cost * 10000) / 10000 }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/meta-spend.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/meta-spend.ts tests/meta-spend.test.ts
git commit -m "feat(billing): pure Meta-spend helpers (ranges, aggregation, parsing, bucketing)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migration — spend tables + cron (`database/migrations/063_meta_spend.sql`)

**Files:**
- Create: `database/migrations/063_meta_spend.sql`

**Interfaces:**
- Produces: `meta_spend_daily`, `meta_spend_sync` (both RLS deny-all); cron `meta-spend-sync`.

- [ ] **Step 1: Write the migration**

Create `database/migrations/063_meta_spend.sql`:

```sql
-- Meta Spend & Billing: real per-day per-category spend from Meta pricing_analytics.
-- FINANCIAL DATA — must NOT be deleted by campaign-retention cleanup.

CREATE TABLE IF NOT EXISTS public.meta_spend_daily (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  waba_id      TEXT,
  day          DATE NOT NULL,
  category     TEXT NOT NULL,
  volume       INTEGER NOT NULL DEFAULT 0,
  cost         NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency     TEXT,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, day, category)
);
CREATE INDEX IF NOT EXISTS idx_meta_spend_daily_ws_day ON public.meta_spend_daily (workspace_id, day);

CREATE TABLE IF NOT EXISTS public.meta_spend_sync (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  range_start  DATE,
  range_end    DATE,
  rows_upserted INTEGER DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'ok',
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_spend_sync_ws ON public.meta_spend_sync (workspace_id, created_at DESC);

ALTER TABLE public.meta_spend_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_spend_sync  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_spend_daily_no_client ON public.meta_spend_daily;
CREATE POLICY meta_spend_daily_no_client ON public.meta_spend_daily FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS meta_spend_sync_no_client ON public.meta_spend_sync;
CREATE POLICY meta_spend_sync_no_client ON public.meta_spend_sync FOR ALL USING (false) WITH CHECK (false);

-- Daily sync cron. NOTE: uses app.base_url / app.cron_secret if set; otherwise the controller
-- inlines the URL + CRON_SECRET literally (as with the reply-sweep / sla jobs).
SELECT cron.unschedule('meta-spend-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'meta-spend-sync'
);
SELECT cron.schedule(
  'meta-spend-sync',
  '0 5 * * *',   -- 05:00 UTC daily
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/meta-spend-sync',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
```

- [ ] **Step 2: Reviewer reads the SQL (no local Postgres)**

Controller applies live (inlining the cron secret). Confirm the file matches repo conventions (compare `057_reply_sweep_cron.sql` for the cron; `060`/`061` for RLS deny-all).

- [ ] **Step 3: Commit**

```bash
git add database/migrations/063_meta_spend.sql
git commit -m "feat(billing): meta_spend_daily + meta_spend_sync tables (RLS deny-all) + daily cron

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Sync service + cron route

**Files:**
- Create: `lib/meta-spend-sync.ts`
- Create: `app/api/cron/meta-spend-sync/route.ts`

**Interfaces:**
- Consumes: `parsePricingAnalytics` (Task 1); `createAdminClient`.
- Produces: `syncWorkspaceSpend(db, workspace, days?): Promise<{ rows: number; error?: string }>` — used by the cron route AND the client Refresh route (Task 4).

- [ ] **Step 1: Write the sync service**

Create `lib/meta-spend-sync.ts`:

```typescript
// lib/meta-spend-sync.ts — fetch Meta pricing_analytics and upsert meta_spend_daily.
import { parsePricingAnalytics } from '@/lib/meta-spend';

const GRAPH = 'https://graph.facebook.com/v19.0';

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally { clearTimeout(t); }
}

export async function syncWorkspaceSpend(
  db: any,
  workspace: { id: string; waba_id: string | null; access_token: string | null },
  days = 35,
): Promise<{ rows: number; error?: string }> {
  const rangeEnd = new Date();
  const rangeStart = new Date(Date.now() - days * 86400_000);
  let error: string | undefined;
  let rowsUpserted = 0;
  try {
    if (!workspace.waba_id || !workspace.access_token) throw new Error('missing waba_id or token');
    const token = workspace.access_token.replace(/﻿/g, '').trim();

    // currency (+ timezone) from the WABA node
    const meta = await fetchJson(`${GRAPH}/${workspace.waba_id}?fields=currency,timezone_id&access_token=${encodeURIComponent(token)}`);
    const currency: string = meta.ok ? (meta.body?.currency ?? '') : '';

    // pricing_analytics: daily, by category
    const start = Math.floor(rangeStart.getTime() / 1000);
    const end = Math.floor(rangeEnd.getTime() / 1000);
    const params = new URLSearchParams({ start: String(start), end: String(end), granularity: 'DAILY', dimensions: '["PRICING_CATEGORY"]', access_token: token });
    const pa = await fetchJson(`${GRAPH}/${workspace.waba_id}/pricing_analytics?${params}`);
    if (!pa.ok) throw new Error(`pricing_analytics ${pa.status}: ${String(pa.body?.error?.message ?? '').slice(0, 120)}`);

    const rows = parsePricingAnalytics(pa.body, currency);
    if (rows.length) {
      const payload = rows.map((r) => ({
        workspace_id: workspace.id, waba_id: workspace.waba_id, day: r.day, category: r.category,
        volume: r.volume, cost: r.cost, currency: r.currency, synced_at: new Date().toISOString(),
      }));
      const { error: upErr } = await db.from('meta_spend_daily').upsert(payload, { onConflict: 'workspace_id,day,category' });
      if (upErr) throw new Error(`upsert: ${upErr.message}`);
      rowsUpserted = payload.length;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await db.from('meta_spend_sync').insert({
    workspace_id: workspace.id,
    range_start: rangeStart.toISOString().slice(0, 10),
    range_end: rangeEnd.toISOString().slice(0, 10),
    rows_upserted: rowsUpserted, status: error ? 'error' : 'ok', error: error ?? null,
  });
  return { rows: rowsUpserted, error };
}
```

- [ ] **Step 2: Write the cron route**

Create `app/api/cron/meta-spend-sync/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { syncWorkspaceSpend } from '@/lib/meta-spend-sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = createAdminClient() as any;
  const { data: workspaces } = await db
    .from('workspaces')
    .select('id, waba_id, access_token')
    .not('waba_id', 'is', null)
    .not('access_token', 'is', null)
    .eq('is_active', true);

  let synced = 0, failed = 0;
  for (const ws of (workspaces ?? [])) {
    const r = await syncWorkspaceSpend(db, ws);
    if (r.error) failed++; else synced++;
  }
  return NextResponse.json({ workspaces: (workspaces ?? []).length, synced, failed });
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` (clean). Do NOT run `npx next build`.

```bash
git add lib/meta-spend-sync.ts app/api/cron/meta-spend-sync/route.ts
git commit -m "feat(billing): Meta pricing_analytics sync service + daily cron route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Client API — summary / series / history / export / refresh

**Files:**
- Create: `lib/meta-spend-load.ts` (the `loadSpendRows` paginated loader — see shared pattern)
- Create: `app/api/billing/meta-spend/summary/route.ts`
- Create: `app/api/billing/meta-spend/series/route.ts`
- Create: `app/api/billing/meta-spend/history/route.ts`
- Create: `app/api/billing/meta-spend/export/route.ts`
- Create: `app/api/billing/meta-spend/refresh/route.ts`

**Interfaces:**
- Consumes: `sumCost`, `pctChange`, `bucketSeries`, `resolveRange`, `SpendRow` (Task 1); `syncWorkspaceSpend` (Task 3); `paginateAll`/`streamingCsvResponse` (`@/lib/export-stream`); `requireWorkspacePermission`/`authzResponse`/`AuthzError`; `createAdminClient`.

Shared pattern for read routes: resolve `workspaceId` (400 if missing) → `requireWorkspacePermission(workspaceId, 'view_analytics')` → read `from`/`to` (default `resolveRange('last_30_days', new Date())`) → load ALL the workspace's rows via `paginateAll` (see below) → compute with the helpers. A shared loader keeps this DRY:

```typescript
import { paginateAll } from '@/lib/export-stream';
import type { SpendRow } from '@/lib/meta-spend';
async function loadSpendRows(db: any, workspaceId: string): Promise<SpendRow[]> {
  const out: SpendRow[] = [];
  for await (const page of paginateAll<SpendRow>((offset, pageSize) =>
    db.from('meta_spend_daily').select('day, category, volume, cost, currency')
      .eq('workspace_id', workspaceId).order('day', { ascending: true }).order('category', { ascending: true })
      .range(offset, offset + pageSize - 1),
  )) out.push(...page);
  return out;
}
```
**Create this as `lib/meta-spend-load.ts` (exporting `loadSpendRows`)** and import it in summary/series/history — never a bare capped `.select()`.

- [ ] **Step 1: summary route**

Create `app/api/billing/meta-spend/summary/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, sumCost, pctChange, type SpendRow } from '@/lib/meta-spend';
import { loadSpendRows } from '@/lib/meta-spend-load';

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');
    const db = createAdminClient() as any;
    const now = new Date();
    const period = sp.get('from') && sp.get('to')
      ? { from: sp.get('from')!, to: sp.get('to')! }
      : resolveRange(sp.get('range') ?? 'last_30_days', now);

    // Load ALL rows via paginateAll (past the 1000-row cap) — see loadSpendRows in the shared pattern.
    const rows = await loadSpendRows(db, workspaceId);
    const currency = rows[0]?.currency ?? '';

    const today = now.toISOString().slice(0, 10);
    const t = (q: string) => { const r = resolveRange(q, now); return sumCost(rows, r.from, r.to); };
    const periodCost = sumCost(rows, period.from, period.to);
    // previous equivalent period (same length, immediately before)
    const days = Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86400000) + 1;
    const prevTo = new Date(Date.parse(period.from) - 86400000).toISOString().slice(0, 10);
    const prevFrom = new Date(Date.parse(period.from) - days * 86400000).toISOString().slice(0, 10);
    const prevCost = sumCost(rows, prevFrom, prevTo);

    const { data: lastSync } = await db.from('meta_spend_sync')
      .select('created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(1);

    // category breakdown for the period
    const breakdown: Record<string, number> = {};
    for (const r of rows) if (r.day >= period.from && r.day <= period.to) breakdown[r.category] = (breakdown[r.category] ?? 0) + r.cost;

    return NextResponse.json({
      currency,
      period, period_cost: periodCost, pct_change: pctChange(periodCost, prevCost),
      today: t('today'), this_week: t('this_week'), this_month: t('this_month'),
      total: sumCost(rows, '0000-01-01', today),
      breakdown,
      last_synced_at: lastSync?.[0]?.created_at ?? null,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[MetaSpend summary]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: series route**

Create `app/api/billing/meta-spend/series/route.ts` — same auth/load, then:
`const bucket = (sp.get('bucket') as 'day'|'week'|'month') ?? 'day';` and return
`{ series: bucketSeries(rows, period.from, period.to, bucket), currency }` (import `bucketSeries`, `resolveRange`, `SpendRow`). Default period `last_30_days`.

- [ ] **Step 3: history route**

Create `app/api/billing/meta-spend/history/route.ts` — auth/load, filter rows to `period.from..to`, sort by `day` desc then category, return `{ rows: filtered, currency }` (each row `{ day, category, volume, cost }`).

- [ ] **Step 4: export route**

Create `app/api/billing/meta-spend/export/route.ts` (`runtime='nodejs'`, `dynamic='force-dynamic'`): auth, resolve period, then stream via `lib/export-stream.ts`:
headers `['Date','Category','Messages','Cost','Currency']`; `paginateAll` over
`db.from('meta_spend_daily').select('day,category,volume,cost,currency').eq('workspace_id', workspaceId).gte('day', from).lte('day', to).order('day',{ascending:true}).order('category',{ascending:true}).range(offset, offset+pageSize-1)`; `mapRow = r => [r.day, r.category, r.volume, r.cost, r.currency]`; filename `meta_spend_<from>_<to>`.

- [ ] **Step 5: refresh route**

Create `app/api/billing/meta-spend/refresh/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { syncWorkspaceSpend } from '@/lib/meta-spend-sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');
    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('id, waba_id, access_token').eq('id', workspaceId).single();
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    const r = await syncWorkspaceSpend(db, ws);
    return NextResponse.json({ ok: !r.error, rows: r.rows, error: r.error ?? null, last_synced_at: new Date().toISOString() });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[MetaSpend refresh]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` (clean).

```bash
git add app/api/billing/meta-spend
git commit -m "feat(billing): Meta-spend client API (summary, series, history, export, refresh)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Client dashboard — `Billing & Meta Spend` page

**Files:**
- Create: `app/(dashboard)/billing/page.tsx`
- Create: `modules/billing/components/MetaSpendDashboard/index.tsx`
- Modify: the client sidebar nav to add a `Billing & Meta Spend` entry (`/billing`).

**Interfaces:**
- Consumes: the Task-4 API. Uses the workspace id from `useWorkspaceStore`. Chart via `recharts`.

- [ ] **Step 1: Locate the sidebar + add the nav entry**

Run: `grep -rn "href.*'/analytics'\|/analytics" modules --include=*.tsx | head` and open the client sidebar component that lists nav links. Add an entry `{ label: 'Billing & Meta Spend', href: '/billing' }` alongside Analytics, matching the existing item markup. Also add `{ key: 'billing', label: 'Billing & Meta Spend', href: '/billing' }` to `lib/agent-pages.ts` `AGENT_RESTRICTABLE_PAGES` so it participates in agent page-access.

- [ ] **Step 2: Create the page**

Create `app/(dashboard)/billing/page.tsx`:

```tsx
import { MetaSpendDashboard } from '@/modules/billing/components/MetaSpendDashboard';
export default function BillingPage() {
  return <MetaSpendDashboard />;
}
```

- [ ] **Step 3: Create the dashboard component**

Create `modules/billing/components/MetaSpendDashboard/index.tsx` — a client component that:
- reads `workspaceId` from `useWorkspaceStore((s) => s.activeWorkspace?.id)`;
- has a quick-filter selector (Today, Yesterday, Last 7 Days, This/Last Week, This/Last Month, Last 30/90 Days, This Year) + optional custom from/to, held in state; default `last_30_days`;
- fetches `/api/billing/meta-spend/summary?workspaceId=&range=` (or `&from=&to=`) and `/series?...&bucket=day`;
- renders: a headline **Total / period cost** with the returned `currency` symbol and the `pct_change`; cards for **Today / This Week / This Month**; a **recharts** area/line chart of the series (`ResponsiveContainer` + `AreaChart`, `XAxis` label, `YAxis`, `Tooltip`); a **category breakdown** (Marketing/Utility/Authentication/Service) as small stat rows; a **billing history** table from `/history`; a **Download** button opening `/api/billing/meta-spend/export?workspaceId=&from=&to=`; and a **"Last synced …"** line with a **Refresh** button that POSTs `/refresh` then re-fetches.
- Include a fixed disclaimer line: *"Meta Reported Spend — usage-based figures reported by Meta; taxes/credits on your final invoice may differ."*
- Handle loading (skeleton/spinner), empty ("No Meta billing data for this period."), and error states without exposing internals.
- Format currency via `new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR' })` (fall back gracefully if `currency` is an unknown code — wrap in try/catch, else show the raw number + code).
- Match the styling of the existing Analytics dashboard (reuse its Card/typography conventions; recharts is already used there).

Keep the component focused; if it grows large, split the chart and the history table into sibling files under the same folder.

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` (clean). Do NOT run `npx next build` (controller runs it at final review).

```bash
git add app/(dashboard)/billing modules/billing lib/agent-pages.ts <sidebar file>
git commit -m "feat(billing): Billing & Meta Spend client dashboard + nav entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Super-admin global spend view

**Files:**
- Create: `app/api/admin/meta-spend/route.ts` (GET — platform-wide aggregates)
- Modify/Create: an admin UI panel that renders it (follow the existing `modules/admin` + `AdminSidebar` pattern; if there's an existing admin billing page, add a section, else a new admin page).

**Interfaces:**
- Consumes: `is_platform_admin` gate (same pattern as `app/api/admin/meta-billing/route.ts`); `createAdminClient`.

- [ ] **Step 1: Admin API**

Create `app/api/admin/meta-spend/route.ts` — verify `is_platform_admin` (copy the `checkAdmin` pattern from `app/api/admin/meta-billing/route.ts`); accept `from`/`to` (default last 30 days); return:
- `total` platform spend for the range (sum of `meta_spend_daily.cost`),
- `by_client`: `[{ workspace_id, name, cost }]` (join workspaces, group by workspace, order by cost desc — top spenders first),
- `recent_failures`: last 20 `meta_spend_sync` rows where `status='error'` (workspace name + error + created_at).
Query `meta_spend_daily` filtered by `day` range with the admin client. (No RLS concern — admin client is service-role; the endpoint is `is_platform_admin`-gated.)

- [ ] **Step 2: Admin UI panel**

Add an admin panel (in the existing admin area) showing the platform total, a **top-clients-by-spend** table, and a **sync failures** list. Match the existing admin styling. Wire it to the Step-1 endpoint.

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` (clean).

```bash
git add app/api/admin/meta-spend modules/admin
git commit -m "feat(billing): super-admin global Meta-spend view (totals, top clients, sync failures)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation (controller-run)

- Full build + suite: `npx tsc --noEmit && npx vitest run && npx next build` (confirm the billing + cron routes registered).
- **Apply migration 063 to the live DB** (tables + RLS + cron) via a one-off `pg` script; inline the cron URL + `CRON_SECRET`. Verify the 2 tables exist, RLS deny-all, and `meta-spend-sync` is scheduled.
- **Live sync verify:** trigger `syncWorkspaceSpend` for a real WABA (Razorveda) — or POST the deployed `/api/cron/meta-spend-sync` — and confirm `meta_spend_daily` populates with per-day per-category cost matching the live `pricing_analytics` numbers; confirm currency detected; **re-run and confirm totals don't multiply** (idempotency).
- **Tenant-isolation check:** a summary/export request for workspace A while authorized only for B → 403; tables not readable by client roles.
- Push to `origin/main`, tell the user to redeploy.

## Self-review notes (coverage vs spec)

- Real spend source (pricing_analytics) + parsing/bucketing → Task 1 + Task 3.
- Tables + RLS + financial-retention isolation + cron → Task 2.
- Sync (idempotent upsert, currency detect, audit) → Task 3.
- Client API (summary/cards/%-change, series, history, export uncapped, refresh) → Task 4.
- Dashboard (cards, filters, chart, breakdown, history, export, refresh, last-synced, disclaimer, currency, states) → Task 5.
- Admin global view → Task 6.
- Multi-tenant isolation → Tasks 4/6 (`view_analytics` / `is_platform_admin`) + RLS deny-all; verified live.
- Tests → Task 1 unit; controller live sync + isolation verify.
- No campaign attribution / no fabricated numbers → enforced by using only Meta `cost`.

# Tenant Health Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily watchdog that detects tenants who were active but have gone silent (zero recent inbound), records per-tenant health, probes Meta for why, surfaces it in the existing admin health UI, and emails platform admins only the newly-silent.

**Architecture:** A pure classifier (`lib/tenant-health.ts`) decides ok/silent from per-tenant counts; a SQL RPC computes those counts; a cron route (`/api/cron/tenant-health`) classifies, probes Meta for silent tenants, upserts a `workspace_health` state table, writes a `platform_health_reports` summary, and emails newly-silent to platform admins. A daily pg_cron job triggers it.

**Tech Stack:** Next.js 15 route handler (Node runtime), TypeScript, Vitest, Supabase Postgres (RPC + pg_cron), `lib/mailer.ts` (Gmail/Resend).

## Global Constraints

- **Detection (baseline-relative):** a workspace is `silent` iff `is_active` AND `baseline_count >= 20` (inbound in the window `now-16d` … `now-2d`) AND `recent_count == 0` (inbound in the last 48h). Otherwise `ok`. Constants: `MIN_BASELINE_INBOUND=20`, `RECENT_HOURS=48`, `BASELINE_FROM_DAYS=16`, `BASELINE_TO_DAYS=2`.
- **Inbound** = `messages.direction='inbound'` joined to the workspace via `conversations`.
- **Email only the newly-silent** (prior status not `'silent'` → now `'silent'`); still-silent and recovered never email.
- **Meta probe only for currently-silent tenants** (bounded), each wrapped in try/catch + 8s timeout so one tenant can't fail the run.
- **Secrets:** the RPC returns `access_token`, so it MUST `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` (SECURITY DEFINER). The route uses the admin (service-role) client only.
- **Cron:** daily; scheduled via pg_cron with the URL + `CRON_SECRET` **inlined** by the controller when applying to the live DB (the committed migration uses `current_setting` + a NOTE — no secret in git). Same pattern as `missed-reply-sweep` / `sla-breach-check`.
- Route auth: `Authorization: Bearer <CRON_SECRET>`.
- Commit after each task (Conventional Commit; end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

---

### Task 1: Pure classifier + newly-silent diff (`lib/tenant-health.ts`)

**Files:**
- Create: `lib/tenant-health.ts`
- Test: `tests/tenant-health.test.ts`

**Interfaces:**
- Produces:
  - `const TENANT_HEALTH = { MIN_BASELINE_INBOUND: 20, RECENT_HOURS: 48, BASELINE_FROM_DAYS: 16, BASELINE_TO_DAYS: 2 }`
  - `type TenantStatus = 'ok' | 'silent'`
  - `classifyTenant(row: { is_active: boolean; baseline_count: number; recent_count: number }, minBaseline?: number): TenantStatus`
  - `diffNewlySilent(prev: Map<string, TenantStatus>, current: Array<{ workspace_id: string; status: TenantStatus }>): string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/tenant-health.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { classifyTenant, diffNewlySilent, type TenantStatus } from '../lib/tenant-health';

describe('classifyTenant', () => {
  it('silent: active, established baseline, zero recent', () => {
    expect(classifyTenant({ is_active: true, baseline_count: 40, recent_count: 0 })).toBe('silent');
    expect(classifyTenant({ is_active: true, baseline_count: 20, recent_count: 0 })).toBe('silent'); // boundary: exactly 20
  });
  it('ok: inactive workspace never flagged', () => {
    expect(classifyTenant({ is_active: false, baseline_count: 100, recent_count: 0 })).toBe('ok');
  });
  it('ok: not established (baseline below floor)', () => {
    expect(classifyTenant({ is_active: true, baseline_count: 19, recent_count: 0 })).toBe('ok');
  });
  it('ok: still receiving inbound', () => {
    expect(classifyTenant({ is_active: true, baseline_count: 40, recent_count: 1 })).toBe('ok');
  });
});

describe('diffNewlySilent', () => {
  const cur = (m: Record<string, TenantStatus>) =>
    Object.entries(m).map(([workspace_id, status]) => ({ workspace_id, status }));
  it('flags ok→silent and no-prior→silent, excludes still-silent and recovered', () => {
    const prev = new Map<string, TenantStatus>([['a', 'ok'], ['b', 'silent'], ['d', 'silent']]);
    const current = cur({ a: 'silent', b: 'silent', c: 'silent', d: 'ok' });
    // a: ok→silent ✓, b: still-silent ✗, c: no-prior→silent ✓, d: recovered ✗
    expect(diffNewlySilent(prev, current).sort()).toEqual(['a', 'c']);
  });
  it('empty when nothing newly silent', () => {
    const prev = new Map<string, TenantStatus>([['a', 'silent']]);
    expect(diffNewlySilent(prev, cur({ a: 'silent' }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tenant-health.test.ts`
Expected: FAIL — `Cannot find module '../lib/tenant-health'`.

- [ ] **Step 3: Write the implementation**

Create `lib/tenant-health.ts`:

```typescript
// lib/tenant-health.ts — pure tenant silent-detection logic.

export const TENANT_HEALTH = {
  MIN_BASELINE_INBOUND: 20, // established-tenant floor over the baseline window
  RECENT_HOURS: 48,         // "gone dark" window
  BASELINE_FROM_DAYS: 16,   // baseline window start (days ago)
  BASELINE_TO_DAYS: 2,      // baseline window end (days ago)
} as const;

export type TenantStatus = 'ok' | 'silent';

// A workspace is silent only if it is active, was established (enough baseline
// inbound), and has received zero inbound in the recent window.
export function classifyTenant(
  row: { is_active: boolean; baseline_count: number; recent_count: number },
  minBaseline: number = TENANT_HEALTH.MIN_BASELINE_INBOUND,
): TenantStatus {
  if (!row.is_active) return 'ok';
  if (row.baseline_count < minBaseline) return 'ok';
  if (row.recent_count > 0) return 'ok';
  return 'silent';
}

// Workspaces that transitioned INTO silent since the last run (prior status not
// 'silent' — covers both ok→silent and no-prior→silent). Still-silent and
// recovered are excluded.
export function diffNewlySilent(
  prev: Map<string, TenantStatus>,
  current: Array<{ workspace_id: string; status: TenantStatus }>,
): string[] {
  return current
    .filter((c) => c.status === 'silent' && prev.get(c.workspace_id) !== 'silent')
    .map((c) => c.workspace_id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tenant-health.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/tenant-health.ts tests/tenant-health.test.ts
git commit -m "feat(watchdog): pure tenant silent-detection classifier + newly-silent diff

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migration — `workspace_health` + snapshot RPC + cron (`database/migrations/060_tenant_health.sql`)

**Files:**
- Create: `database/migrations/060_tenant_health.sql`

**Interfaces:**
- Produces: table `public.workspace_health`; RPC `public.get_tenant_health_snapshot()` returning `(workspace_id uuid, name text, phone_number_id text, access_token text, is_active boolean, last_inbound_at timestamptz, baseline_count int, recent_count int)`; cron job `tenant-health-check`.

- [ ] **Step 1: Write the migration**

Create `database/migrations/060_tenant_health.sql`:

```sql
-- Tenant Health Watchdog: per-tenant silent-detection state + snapshot RPC + daily cron.

-- ── State table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspace_health (
  workspace_id    UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'ok',   -- 'ok' | 'silent'
  last_inbound_at TIMESTAMPTZ,
  silent_since    TIMESTAMPTZ,
  probe           JSONB DEFAULT '{}',
  notified_at     TIMESTAMPTZ,
  recovered_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_health_no_client ON public.workspace_health;
CREATE POLICY workspace_health_no_client ON public.workspace_health FOR ALL USING (false) WITH CHECK (false);

-- ── Snapshot RPC ──────────────────────────────────────────────────────────────
-- Per active workspace: last inbound, baseline-window count, recent-window count,
-- plus creds for the Meta probe. SECURITY DEFINER; returns access_token so it is
-- REVOKEd from all client roles (service-role/admin client only).
CREATE OR REPLACE FUNCTION public.get_tenant_health_snapshot()
RETURNS TABLE (
  workspace_id    uuid,
  name            text,
  phone_number_id text,
  access_token    text,
  is_active       boolean,
  last_inbound_at timestamptz,
  baseline_count  int,
  recent_count    int
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.name, w.phone_number_id, w.access_token,
         COALESCE(w.is_active, true),
         li.last_inbound_at,
         COALESCE(bl.c, 0)::int,
         COALESCE(rc.c, 0)::int
  FROM public.workspaces w
  LEFT JOIN LATERAL (
    SELECT max(m.created_at) AS last_inbound_at
    FROM public.messages m
    JOIN public.conversations cv ON cv.id = m.conversation_id
    WHERE cv.workspace_id = w.id AND m.direction = 'inbound'
  ) li ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS c
    FROM public.messages m
    JOIN public.conversations cv ON cv.id = m.conversation_id
    WHERE cv.workspace_id = w.id AND m.direction = 'inbound'
      AND m.created_at >= now() - interval '16 days'
      AND m.created_at <  now() - interval '2 days'
  ) bl ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS c
    FROM public.messages m
    JOIN public.conversations cv ON cv.id = m.conversation_id
    WHERE cv.workspace_id = w.id AND m.direction = 'inbound'
      AND m.created_at >= now() - interval '48 hours'
  ) rc ON true
  WHERE COALESCE(w.is_active, true) = true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_health_snapshot() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_health_snapshot() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_health_snapshot() FROM authenticated;

-- ── Daily cron ────────────────────────────────────────────────────────────────
-- NOTE: uses app.base_url / app.cron_secret. Those settings require the postgres
-- superuser (not settable from the pooler). If unavailable, inline the URL +
-- CRON_SECRET literally in the command below (this is what the live job does).
SELECT cron.unschedule('tenant-health-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'tenant-health-check'
);

SELECT cron.schedule(
  'tenant-health-check',
  '30 4 * * *',   -- 04:30 UTC daily (~10:00 IST)
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url', true) || '/api/cron/tenant-health',
      headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
```

- [ ] **Step 2: Verify SQL parses (dry, no apply)**

The controller applies this migration to the live DB (inlining the cron secret) during post-implementation. For this task, just confirm the file is syntactically consistent (matches the pattern of `database/migrations/057_reply_sweep_cron.sql`): a reviewer reads it; no local Postgres is required.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/060_tenant_health.sql
git commit -m "feat(watchdog): workspace_health table + snapshot RPC + daily tenant-health cron

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Cron route (`app/api/cron/tenant-health/route.ts`)

**Files:**
- Create: `app/api/cron/tenant-health/route.ts`

**Interfaces:**
- Consumes: `classifyTenant`, `diffNewlySilent`, `TENANT_HEALTH`, `TenantStatus` from `@/lib/tenant-health`; `createAdminClient` from `@/services/supabase/admin`; `sendMail` from `@/lib/mailer`; the RPC `get_tenant_health_snapshot` (Task 2).

- [ ] **Step 1: Write the route**

Create `app/api/cron/tenant-health/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { sendMail } from '@/lib/mailer';
import { classifyTenant, diffNewlySilent, TENANT_HEALTH, type TenantStatus } from '@/lib/tenant-health';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface SnapshotRow {
  workspace_id: string;
  name: string | null;
  phone_number_id: string | null;
  access_token: string | null;
  is_active: boolean;
  last_inbound_at: string | null;
  baseline_count: number;
  recent_count: number;
}
interface Probe {
  token_ok: boolean;
  quality?: string;
  display_phone_number?: string;
  error?: string;
}

async function probeMeta(pnid: string | null, token: string | null): Promise<Probe> {
  if (!pnid || !token) return { token_ok: false, error: 'missing credentials' };
  const clean = token.replace(/﻿/g, '').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pnid}?fields=verified_name,display_phone_number,quality_rating`,
      { headers: { Authorization: `Bearer ${clean}` }, signal: controller.signal },
    );
    const body = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      return { token_ok: false, error: `HTTP ${res.status}: ${String(body?.error?.message ?? '').slice(0, 80)}` };
    }
    return { token_ok: true, quality: body.quality_rating, display_phone_number: body.display_phone_number };
  } catch (e) {
    return { token_ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/cron/tenant-health — external cron (Bearer CRON_SECRET)
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;
  const nowIso = new Date().toISOString();

  const { data: snapshot, error } = await db.rpc('get_tenant_health_snapshot');
  if (error) {
    console.error('[tenant-health] snapshot rpc failed:', error);
    return NextResponse.json({ error: 'snapshot failed' }, { status: 500 });
  }
  const rows = (snapshot ?? []) as SnapshotRow[];
  const current = rows.map((r) => ({ workspace_id: r.workspace_id, status: classifyTenant(r), row: r }));

  // Prior state (for transitions). Load notified_at/recovered_at too so we can
  // re-send them unchanged in the upsert (see the homogeneous-keys note below).
  const { data: priorRows } = await db.from('workspace_health').select('workspace_id, status, silent_since, notified_at, recovered_at');
  const prevStatus = new Map<string, TenantStatus>();
  const prevSilentSince = new Map<string, string | null>();
  const prevNotifiedAt = new Map<string, string | null>();
  const prevRecoveredAt = new Map<string, string | null>();
  for (const p of (priorRows ?? []) as Array<{ workspace_id: string; status: TenantStatus; silent_since: string | null; notified_at: string | null; recovered_at: string | null }>) {
    prevStatus.set(p.workspace_id, p.status);
    prevSilentSince.set(p.workspace_id, p.silent_since);
    prevNotifiedAt.set(p.workspace_id, p.notified_at);
    prevRecoveredAt.set(p.workspace_id, p.recovered_at);
  }

  const newlySilentIds = new Set(
    diffNewlySilent(prevStatus, current.map((c) => ({ workspace_id: c.workspace_id, status: c.status }))),
  );

  // Probe only currently-silent tenants (bounded).
  const probes = new Map<string, Probe>();
  for (const c of current) {
    if (c.status === 'silent') probes.set(c.workspace_id, await probeMeta(c.row.phone_number_id, c.row.access_token));
  }

  // Upsert per-tenant health. IMPORTANT: a batch upsert normalizes every row to
  // the UNION of keys and sends null for any key a row omits — so every row MUST
  // carry the SAME columns, or a row missing notified_at/recovered_at would null
  // out that tenant's existing value. Each field is set to its new value on the
  // relevant transition, otherwise to its prior value.
  const upserts = current.map((c) => {
    const wasSilent = prevStatus.get(c.workspace_id) === 'silent';
    const isSilent = c.status === 'silent';
    return {
      workspace_id: c.workspace_id,
      status: c.status,
      last_inbound_at: c.row.last_inbound_at,
      silent_since: isSilent ? (wasSilent ? (prevSilentSince.get(c.workspace_id) ?? nowIso) : nowIso) : null,
      probe: isSilent ? (probes.get(c.workspace_id) ?? {}) : {},
      notified_at: newlySilentIds.has(c.workspace_id) ? nowIso : (prevNotifiedAt.get(c.workspace_id) ?? null),
      recovered_at: (!isSilent && wasSilent) ? nowIso : (prevRecoveredAt.get(c.workspace_id) ?? null),
      updated_at: nowIso,
    };
  });
  if (upserts.length) {
    const { error: upErr } = await db.from('workspace_health').upsert(upserts, { onConflict: 'workspace_id' });
    if (upErr) console.error('[tenant-health] upsert failed:', upErr);
  }

  const silent = current.filter((c) => c.status === 'silent');
  const newlySilent = current.filter((c) => newlySilentIds.has(c.workspace_id));
  const recovered = current.filter((c) => c.status === 'ok' && prevStatus.get(c.workspace_id) === 'silent');

  // Summary row for the existing admin health-reports UI.
  await db.from('platform_health_reports').insert({
    checked_at: nowIso,
    overall_status: silent.length ? 'error' : 'ok',
    checks: { type: 'tenant_health', silent_count: silent.length, ok_count: current.length - silent.length },
    errors: silent.map((c) => ({ workspace: c.row.name, last_inbound_at: c.row.last_inbound_at, probe: probes.get(c.workspace_id) })),
    has_errors: silent.length > 0,
  });

  // Email platform admins — only the newly-silent.
  let emailed = 0;
  if (newlySilent.length > 0) {
    const { data: admins } = await db.from('profiles').select('email').eq('is_platform_admin', true);
    const to = ((admins ?? []) as Array<{ email?: string }>).map((a) => a.email).filter((e): e is string => !!e);
    if (to.length > 0) {
      const rowsHtml = newlySilent.map((c) => {
        const p = probes.get(c.workspace_id);
        const verdict = p?.token_ok
          ? `token OK, quality ${p.quality ?? '?'} → likely webhook/delivery issue`
          : `credential/number problem: ${p?.error ?? 'unknown'} → check & renew`;
        return `<tr><td>${c.row.name ?? c.workspace_id}</td><td>${c.row.last_inbound_at ?? '—'}</td><td>${verdict}</td></tr>`;
      }).join('');
      const html = `<p>${newlySilent.length} tenant(s) went silent — no inbound in ${TENANT_HEALTH.RECENT_HOURS}h despite prior activity:</p>`
        + `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Tenant</th><th>Last inbound</th><th>Probe</th></tr>${rowsHtml}</table>`;
      const r = await sendMail({ to, subject: `⚠️ ${newlySilent.length} tenant(s) went silent`, html });
      emailed = r.ok ? to.length : 0;
      if (!r.ok) console.error('[tenant-health] email failed:', r.error);
    }
  }

  return NextResponse.json({
    scanned: current.length,
    silent: silent.length,
    newly_silent: newlySilent.length,
    recovered: recovered.length,
    emailed,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Do NOT run `npx next build`; the controller runs it at final review.)

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/tenant-health/route.ts
git commit -m "feat(watchdog): tenant-health cron route — detect, probe, record, email newly-silent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation (controller-run)

- Full build + suite: `npx tsc --noEmit && npx vitest run && npx next build` (confirm `/api/cron/tenant-health` route registered).
- **Apply migration 060 to the live DB** via a one-off `pg` script: create `workspace_health` + RPC + REVOKE, then schedule `tenant-health-check` with the URL + `CRON_SECRET` **inlined** (not `current_setting`). Verify `SELECT jobname FROM cron.job WHERE jobname='tenant-health-check'` returns one row, and that `get_tenant_health_snapshot()` is REVOKEd from anon/authenticated.
- **Live-verify detection:** call `get_tenant_health_snapshot()` and run `classifyTenant` over the rows (or replicate its SQL) → confirm **Skinwise and VMS** classify `silent` and Razorveda/Umang/Fitness First classify `ok`.
- **Live-verify the route:** POST `/api/cron/tenant-health` with the Bearer secret against the deployed app (after redeploy) → confirm `{scanned, silent, newly_silent, ...}`, that `workspace_health` rows populate, and a summary row lands in `platform_health_reports`. (First run marks the current silent set as newly-silent and emails once; subsequent same-day runs email nothing.)
- Push to `origin/main`, tell the user to redeploy.

## Self-review notes (coverage vs spec)

- Baseline-relative detection → Task 1 `classifyTenant` + Task 2 RPC windows.
- workspace_health state + lifecycle (silent_since/recovered_at/notified_at) → Task 2 table + Task 3 upsert logic.
- Meta probe for silent only → Task 3 `probeMeta`.
- Admin UI surfacing → Task 3 `platform_health_reports` summary row (reuses existing UI).
- Email only newly-silent → Task 1 `diffNewlySilent` + Task 3 email gate.
- Secrets (RPC returns access_token) → Task 2 REVOKE; admin-client-only route.
- Daily cron → Task 2 schedule; controller inlines secret on live apply.
- Tests → Task 1 unit (classifier + diff); controller live-verify for detection + route.

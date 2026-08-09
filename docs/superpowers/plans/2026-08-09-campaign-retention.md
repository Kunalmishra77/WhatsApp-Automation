# Per-Campaign Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-campaign 2-month retention lifecycle — auto-detect + notify, a client-driven Download / Download-&-Delete / Delete workflow in the campaign UI, and atomic deletion of only the campaign's recipients+queue (CRM data untouched).

**Architecture:** A pure `computeRetention` derives status from dates; a migration adds 3 campaign columns + an atomic `delete_campaign_data` RPC + a daily notify cron; three API routes expose status/export/delete; a Retention section in CampaignDetail drives it.

**Tech Stack:** Next.js 15 route handlers, TypeScript, Vitest, Supabase Postgres (RPC + pg_cron), the existing `lib/export-stream.ts`, React (campaign UI).

## Global Constraints

- `retention_at = COALESCE(completed_at, created_at) + 2 calendar months`. Status: `deleted` if `data_deleted_at` set; else `expired` if `now >= retention_at`; else `expiring` if `now >= retention_at - 7 days`; else `active`.
- Deletion is **atomic** via `delete_campaign_data(uuid)` RPC (one plpgsql transaction): deletes `campaign_queue` + `campaign_recipients` for the campaign, sets `data_deleted_at = now()`, keeps the campaign row (tombstone). Never touches conversations/messages/contacts.
- API auth: `requireWorkspacePermission(campaign.workspace_id, 'create_campaigns')`; every route resolves the campaign's `workspace_id` first. `[id]` params are `Promise<{ id: string }>` (await them).
- The delete route requires `{ confirmed: true }` or returns 400.
- Export uses `lib/export-stream.ts` (`paginateAll` + `streamingCsvResponse`) with a stable `.order('id')`; sets `data_exported_at` before streaming.
- Cron is pure-SQL (`SELECT public.notify_due_campaign_retention();`) — no HTTP/secret. Notifies `workspace_members` admins (`super_admin`/`admin`) once per campaign (`retention_notified_at`).
- RPCs are SECURITY DEFINER + `SET search_path = public` + `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`.
- Use `(db as any)` / `(query as any)` where the generated Supabase types don't include the new columns (matches existing style).
- Commit after each task (Conventional Commit; end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

---

### Task 1: Pure retention status (`lib/campaign-retention.ts`)

**Files:**
- Create: `lib/campaign-retention.ts`
- Test: `tests/campaign-retention.test.ts`

**Interfaces:**
- Produces:
  - `type CampaignRetentionStatus = 'active' | 'expiring' | 'expired' | 'deleted'`
  - `computeRetention(campaign: { created_at: string; completed_at: string | null; data_deleted_at: string | null }, now: Date): { retentionAt: string; status: CampaignRetentionStatus; daysRemaining: number }`

- [ ] **Step 1: Write the failing test**

Create `tests/campaign-retention.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computeRetention } from '../lib/campaign-retention';

const iso = (d: Date) => d.toISOString();
function daysAgo(n: number): string { const d = new Date('2026-08-09T00:00:00Z'); d.setDate(d.getDate() - n); return iso(d); }
const NOW = new Date('2026-08-09T00:00:00Z');

describe('computeRetention', () => {
  it('active well before the 2-month mark', () => {
    const r = computeRetention({ created_at: daysAgo(200), completed_at: daysAgo(10), data_deleted_at: null }, NOW);
    expect(r.status).toBe('active');
    expect(r.daysRemaining).toBeGreaterThan(7);
  });
  it('expiring within 7 days of retention_at', () => {
    // completed ~ (2 months - 3 days) ago → retention_at ~3 days out
    const base = new Date(NOW); base.setMonth(base.getMonth() - 2); base.setDate(base.getDate() + 3);
    const r = computeRetention({ created_at: iso(base), completed_at: iso(base), data_deleted_at: null }, NOW);
    expect(r.status).toBe('expiring');
    expect(r.daysRemaining).toBeLessThanOrEqual(7);
    expect(r.daysRemaining).toBeGreaterThanOrEqual(0);
  });
  it('expired at/after retention_at', () => {
    const base = new Date(NOW); base.setMonth(base.getMonth() - 3);
    const r = computeRetention({ created_at: iso(base), completed_at: iso(base), data_deleted_at: null }, NOW);
    expect(r.status).toBe('expired');
    expect(r.daysRemaining).toBeLessThan(0);
  });
  it('deleted when data_deleted_at is set (regardless of dates)', () => {
    const r = computeRetention({ created_at: daysAgo(400), completed_at: null, data_deleted_at: daysAgo(1) }, NOW);
    expect(r.status).toBe('deleted');
  });
  it('falls back to created_at when completed_at is null', () => {
    const base = new Date(NOW); base.setMonth(base.getMonth() - 3);
    const r = computeRetention({ created_at: iso(base), completed_at: null, data_deleted_at: null }, NOW);
    expect(r.status).toBe('expired');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/campaign-retention.test.ts`
Expected: FAIL — `Cannot find module '../lib/campaign-retention'`.

- [ ] **Step 3: Write the implementation**

Create `lib/campaign-retention.ts`:

```typescript
// lib/campaign-retention.ts — pure per-campaign retention status.
// retention_at = COALESCE(completed_at, created_at) + 2 calendar months.

export type CampaignRetentionStatus = 'active' | 'expiring' | 'expired' | 'deleted';

const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function computeRetention(
  campaign: { created_at: string; completed_at: string | null; data_deleted_at: string | null },
  now: Date,
): { retentionAt: string; status: CampaignRetentionStatus; daysRemaining: number } {
  const base = new Date(campaign.completed_at ?? campaign.created_at);
  const retention = new Date(base);
  retention.setMonth(retention.getMonth() + 2);
  const retentionAt = retention.toISOString();
  const daysRemaining = Math.ceil((retention.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  let status: CampaignRetentionStatus;
  if (campaign.data_deleted_at) status = 'deleted';
  else if (now.getTime() >= retention.getTime()) status = 'expired';
  else if (now.getTime() >= retention.getTime() - EXPIRING_WINDOW_MS) status = 'expiring';
  else status = 'active';

  return { retentionAt, status, daysRemaining };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/campaign-retention.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/campaign-retention.ts tests/campaign-retention.test.ts
git commit -m "feat(retention): pure per-campaign retention status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migration — columns + atomic delete RPC + notify cron (`database/migrations/062_campaign_retention.sql`)

**Files:**
- Create: `database/migrations/062_campaign_retention.sql`

**Interfaces:**
- Produces: `campaigns.retention_notified_at/data_exported_at/data_deleted_at`; RPC `delete_campaign_data(uuid) RETURNS int`; RPC `notify_due_campaign_retention() RETURNS void`; cron `campaign-retention-check`.

- [ ] **Step 1: Write the migration**

Create `database/migrations/062_campaign_retention.sql`:

```sql
-- Per-campaign retention lifecycle: tracking columns + atomic delete + notify cron.

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS retention_notified_at timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS data_exported_at     timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS data_deleted_at      timestamptz;

-- Atomic deletion of a campaign's per-recipient data (keeps the campaign tombstone + stats).
-- One plpgsql function = one transaction, so a mid-way failure rolls back entirely.
CREATE OR REPLACE FUNCTION public.delete_campaign_data(p_campaign_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.campaign_queue WHERE campaign_id = p_campaign_id;
  DELETE FROM public.campaign_recipients WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  UPDATE public.campaigns SET data_deleted_at = now() WHERE id = p_campaign_id;
  RETURN v_deleted;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_campaign_data(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_campaign_data(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_campaign_data(uuid) FROM authenticated;

-- Notify workspace admins once per campaign that passes its 2-month retention window.
CREATE OR REPLACE FUNCTION public.notify_due_campaign_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH due AS (
    SELECT c.id, c.workspace_id, c.name
    FROM public.campaigns c
    WHERE COALESCE(c.completed_at, c.created_at) + interval '2 months' < now()
      AND c.retention_notified_at IS NULL
      AND c.data_deleted_at IS NULL
  ),
  ins AS (
    INSERT INTO public.notifications (workspace_id, user_id, type, title, body, data)
    SELECT d.workspace_id, m.user_id, 'campaign_retention_due',
           'Campaign "' || COALESCE(d.name, '') || '" data is due for retention',
           'This campaign passed its 2-month retention window. Download or delete its data from the campaign page.',
           jsonb_build_object('campaign_id', d.id)
    FROM due d
    JOIN public.workspace_members m
      ON m.workspace_id = d.workspace_id AND m.role IN ('super_admin', 'admin')
    RETURNING 1
  )
  UPDATE public.campaigns SET retention_notified_at = now()
    WHERE id IN (SELECT id FROM due);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_due_campaign_retention() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_due_campaign_retention() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_due_campaign_retention() FROM authenticated;

-- Daily cron (pure SQL; no HTTP/secret).
SELECT cron.unschedule('campaign-retention-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'campaign-retention-check'
);
SELECT cron.schedule('campaign-retention-check', '0 3 * * *', $$ SELECT public.notify_due_campaign_retention(); $$);
```

- [ ] **Step 2: Reviewer reads the SQL (no local Postgres)**

The controller applies this to the live DB in post-implementation. Confirm the file matches the repo's conventions (compare to `database/migrations/059_offer_lapse_cron.sql` for the pure-SQL cron + `060_tenant_health.sql` for the SECURITY-DEFINER/REVOKE pattern), and that `campaign_recipients`/`campaign_queue` both have a `campaign_id` column (they do) and `notifications` has `(workspace_id, user_id, type, title, body, data)`.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/062_campaign_retention.sql
git commit -m "feat(retention): campaign retention columns + atomic delete RPC + notify cron

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Retention API routes

**Files:**
- Create: `app/api/campaigns/[id]/retention/route.ts` (GET status)
- Create: `app/api/campaigns/[id]/retention/export/route.ts` (GET stream)
- Create: `app/api/campaigns/[id]/retention/delete/route.ts` (POST delete)

**Interfaces:**
- Consumes: `computeRetention` (Task 1); `delete_campaign_data` RPC (Task 2); `paginateAll`/`streamingCsvResponse` from `@/lib/export-stream`; `requireWorkspacePermission`/`authzResponse`/`AuthzError`; `createAdminClient`.

- [ ] **Step 1: GET status route**

Create `app/api/campaigns/[id]/retention/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { computeRetention } from '@/lib/campaign-retention';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;
    const { data: campaign } = await db
      .from('campaigns')
      .select('workspace_id, created_at, completed_at, data_exported_at, data_deleted_at')
      .eq('id', id).single();
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    const { count } = await db.from('campaign_recipients')
      .select('id', { count: 'exact', head: true }).eq('campaign_id', id);
    const r = computeRetention(campaign, new Date());
    return NextResponse.json({
      status: r.status,
      retention_at: r.retentionAt,
      days_remaining: r.daysRemaining,
      recipient_count: count ?? 0,
      data_exported_at: campaign.data_exported_at,
      data_deleted_at: campaign.data_deleted_at,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[CampaignRetention GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: GET export route**

Create `app/api/campaigns/[id]/retention/export/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { paginateAll, streamingCsvResponse } from '@/lib/export-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Recipient {
  name: string | null; phone: string | null; status: string | null;
  sent_at: string | null; delivered_at: string | null; read_at: string | null;
  replied_at: string | null; reply_text: string | null; error_message: string | null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;
    const { data: campaign } = await db
      .from('campaigns').select('workspace_id, name').eq('id', id).single();
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    await db.from('campaigns').update({ data_exported_at: new Date().toISOString() }).eq('id', id);

    const headers = ['Name', 'Phone', 'Status', 'Sent At', 'Delivered At', 'Read At', 'Replied At', 'Reply', 'Error'];
    const pages = paginateAll<Recipient>((offset, pageSize) =>
      db.from('campaign_recipients')
        .select('name, phone, status, sent_at, delivered_at, read_at, replied_at, reply_text, error_message')
        .eq('campaign_id', id)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    );
    const safeName = String(campaign.name ?? 'campaign').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const dateTag = new Date().toISOString().slice(0, 10);
    return streamingCsvResponse<Recipient>(
      headers, pages,
      (r) => [r.name, r.phone, r.status, r.sent_at, r.delivered_at, r.read_at, r.replied_at, r.reply_text, r.error_message],
      `campaign_${safeName}_${dateTag}`,
    );
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[CampaignRetention export]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: POST delete route**

Create `app/api/campaigns/[id]/retention/delete/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { confirmed } = await request.json() as { confirmed?: boolean };
    if (!confirmed) return NextResponse.json({ error: 'confirmed:true required' }, { status: 400 });

    const db = createAdminClient() as any;
    const { data: campaign } = await db.from('campaigns').select('workspace_id').eq('id', id).single();
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    const { data: deleted, error } = await db.rpc('delete_campaign_data', { p_campaign_id: id });
    if (error) {
      console.error('[CampaignRetention delete rpc]', error);
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, deleted_recipients: deleted ?? 0, data_deleted_at: new Date().toISOString() });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[CampaignRetention delete]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Do NOT run `npx next build`; controller runs it at final review.)

- [ ] **Step 5: Commit**

```bash
git add app/api/campaigns/[id]/retention/route.ts app/api/campaigns/[id]/retention/export/route.ts app/api/campaigns/[id]/retention/delete/route.ts
git commit -m "feat(retention): campaign retention API — status, export, atomic delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Retention section in CampaignDetail

**Files:**
- Create: `modules/campaigns/components/CampaignRetention/index.tsx`
- Modify: `modules/campaigns/components/CampaignDetail/index.tsx` (mount the section)

**Interfaces:**
- Consumes: `GET/POST /api/campaigns/[id]/retention…` (Task 3). Props: `{ campaignId: string }`.

- [ ] **Step 1: Create the CampaignRetention component**

Create `modules/campaigns/components/CampaignRetention/index.tsx`:

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';

interface RetentionInfo {
  status: 'active' | 'expiring' | 'expired' | 'deleted';
  retention_at: string;
  days_remaining: number;
  recipient_count: number;
  data_exported_at: string | null;
  data_deleted_at: string | null;
}

const BADGE: Record<RetentionInfo['status'], string> = {
  active:   'bg-green-100 text-green-700',
  expiring: 'bg-amber-100 text-amber-700',
  expired:  'bg-red-100 text-red-700',
  deleted:  'bg-gray-200 text-gray-600',
};
const LABEL: Record<RetentionInfo['status'], string> = {
  active: 'Active', expiring: 'Expiring soon', expired: 'Expired — action needed', deleted: 'Data deleted',
};

export function CampaignRetention({ campaignId }: { campaignId: string }) {
  const [info, setInfo] = useState<RetentionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/retention`);
    if (res.ok) setInfo(await res.json() as RetentionInfo);
  }, [campaignId]);

  useEffect(() => { void load(); }, [load]);

  const download = () => window.open(`/api/campaigns/${campaignId}/retention/export`, '_blank');

  const doDelete = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/retention/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      if (!res.ok) { setError((await res.json()).error ?? 'Delete failed'); return; }
      await load();
    } finally { setBusy(false); }
  }, [campaignId, load]);

  const onDeleteClick = () => {
    if (window.confirm('Delete this campaign’s recipient data? The campaign and its stats are kept, but the per-recipient details cannot be recovered.')) {
      void doDelete();
    }
  };
  const onDownloadDelete = () => {
    download();
    if (window.confirm('A download has started. Delete the campaign’s recipient data now that you have a copy?')) {
      void doDelete();
    }
  };

  if (!info) return null;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Data Retention</h3>
        <span className={`text-xs rounded-full px-2 py-0.5 ${BADGE[info.status]}`}>{LABEL[info.status]}</span>
      </div>
      {info.status === 'deleted' ? (
        <p className="text-sm text-gray-500">Data deleted on {info.data_deleted_at ? new Date(info.data_deleted_at).toLocaleDateString() : '—'}. Campaign stats are retained.</p>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            {info.recipient_count} recipient record(s). Retention date: {new Date(info.retention_at).toLocaleDateString()}
            {info.status === 'expired' ? ' (passed)' : ` (${info.days_remaining} day(s) left)`}.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 flex-wrap">
            <button disabled={busy} onClick={download} className="px-3 py-1.5 rounded border text-sm disabled:opacity-50">Download</button>
            <button disabled={busy} onClick={onDownloadDelete} className="px-3 py-1.5 rounded border text-sm disabled:opacity-50">Download &amp; Delete</button>
            <button disabled={busy} onClick={onDeleteClick} className="px-3 py-1.5 rounded bg-red-600 text-white text-sm disabled:opacity-50">Delete</button>
          </div>
        </>
      )}
    </div>
  );
}
```

(Match the surrounding CampaignDetail styling conventions — swap the utility classes if the page uses a shared Card/Button component; keep the behavior.)

- [ ] **Step 2: Mount it in CampaignDetail**

In `modules/campaigns/components/CampaignDetail/index.tsx`, import the component and render it inside the Overview tab (near the campaign meta / "Completed At" block in `OverviewTab`), passing the campaign id:

```tsx
import { CampaignRetention } from '@/modules/campaigns/components/CampaignRetention';
// ...inside OverviewTab's JSX, after the meta card:
<CampaignRetention campaignId={campaign.id} />
```

(Confirm the campaign id is available in `OverviewTab` — it receives `campaign`; use `campaign.id`. If `OverviewTab` doesn't have the id, thread it from the parent that already has `campaignId`.)

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add modules/campaigns/components/CampaignRetention/index.tsx modules/campaigns/components/CampaignDetail/index.tsx
git commit -m "feat(retention): Data Retention section in CampaignDetail (download / download+delete / delete)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation (controller-run)

- Full build + suite: `npx tsc --noEmit && npx vitest run && npx next build` (confirm the 3 retention routes registered).
- **Apply migration 062 to the live DB** (columns + RPCs + REVOKE + cron) via a one-off `pg` script. Verify: the 3 columns exist; `delete_campaign_data`/`notify_due_campaign_retention` REVOKE'd from anon/authenticated; `campaign-retention-check` in `cron.job`.
- **Live verify (rolled-back transaction):** pick a test campaign, run `delete_campaign_data(id)` inside `BEGIN … ROLLBACK`; assert its `campaign_recipients`/`campaign_queue` rows are removed, `data_deleted_at` set, and the campaign row + a sample contact/conversation survive. Run `notify_due_campaign_retention()` similarly and confirm it notifies the one currently-due campaign and sets `retention_notified_at` (then ROLLBACK).
- Push to `origin/main`, tell the user to redeploy.

## Self-review notes (coverage vs spec)

- retention_at + status → Task 1 `computeRetention`.
- columns + atomic delete + notify cron → Task 2.
- status/export/delete API → Task 3 (export reuses `lib/export-stream.ts`; delete uses the RPC + confirmed guard).
- UI (badge + Download / Download&Delete / Delete / deleted tombstone) → Task 4.
- Safe deletion (recipients+queue only, CRM untouched, atomic) → Task 2 RPC + live verify.
- Notify once → Task 2 `retention_notified_at`.
- Tests → Task 1 unit; controller live-verify for delete/notify.

# Missed-Reply Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A platform-wide safety net that finds conversations where the customer's latest message is unanswered and sends the catch-up reply, so no client ever leaves a customer waiting.

**Architecture:** A pg_cron job (every 3 min) hits a secured endpoint that scans all workspaces for unanswered conversations and sends each the same-quality AI reply by reusing `getAIReply` + `fetchKnowledgeBaseContext` from `lib/ai-reply.ts`. No changes to the webhook hot path.

**Tech Stack:** TypeScript, Next.js App Router, Supabase admin client, pg, pg_cron + pg_net, Vitest.

## Global Constraints
- No modification of `app/api/webhooks/whatsapp/route.ts` (the hot path).
- Idempotent: re-check "no outbound after the customer's last message" immediately before sending. Never double-reply.
- Only free-form send within Meta's 24h window; only `status='open'` + `bot_paused=false`; skip blocked/opted-out contacts, active flow sessions, and decline/stop messages.
- Endpoint authorized by `Authorization: Bearer <CRON_SECRET>`; 401 otherwise.
- Sweep params: `minAgeMinutes=2`, `windowHours=24`, `limit=200`. Cron every 3 min.
- Every failure fail-open (logged, never throws); the sweep must not affect the real-time path.

## File Structure
- `lib/reply-sweep.ts` — `isDeclineMessage` (pure), `findUnansweredConversations`, `sendCatchupReply`.
- `app/api/cron/reply-sweep/route.ts` — secured cron endpoint.
- `database/migrations/057_reply_sweep_cron.sql` — pg_cron job.
- `tests/reply-sweep.test.ts` — unit tests for `isDeclineMessage`.

---

### Task 1: `isDeclineMessage` pure predicate

**Files:** Create `lib/reply-sweep.ts` (this function only); Test `tests/reply-sweep.test.ts`.

**Produces:** `isDeclineMessage(content: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**
```ts
// tests/reply-sweep.test.ts
import { describe, expect, it } from 'vitest';
import { isDeclineMessage } from '../lib/reply-sweep';

describe('isDeclineMessage', () => {
  it('flags decline / stop signals (any case, incl. button taps)', () => {
    for (const s of ['Not interested', '[Tapped button: "Not Interested"]', 'STOP', 'please unsubscribe', 'band karo', 'mat bhejo'])
      expect(isDeclineMessage(s)).toBe(true);
  });
  it('does not flag normal buying/greeting messages', () => {
    for (const s of ['[Tapped button: "Shop Now"]', 'Hi', 'I want breast care', 'price kya hai'])
      expect(isDeclineMessage(s)).toBe(false);
  });
  it('handles null/empty', () => {
    expect(isDeclineMessage(null)).toBe(false);
    expect(isDeclineMessage('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** — `npx vitest run tests/reply-sweep.test.ts` (module/function missing).

- [ ] **Step 3: Implement**
```ts
// lib/reply-sweep.ts
const DECLINE_PATTERNS = [
  'not interested', 'no thanks', 'no thank you', 'stop', 'unsubscribe',
  'band karo', 'band kar', 'mat bhejo', 'nahi chahiye', 'dont want', "don't want",
];

/** True when the customer's last message is a decline / opt-out signal — skip re-engaging. */
export function isDeclineMessage(content: string | null | undefined): boolean {
  if (!content) return false;
  const t = content.toLowerCase();
  return DECLINE_PATTERNS.some((p) => t.includes(p));
}
```

- [ ] **Step 4: Run — expect PASS.** Then `npx vitest run` (full suite green), `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add lib/reply-sweep.ts tests/reply-sweep.test.ts && git commit -m "feat(watchdog): isDeclineMessage predicate"`

---

### Task 2: `findUnansweredConversations` + `sendCatchupReply`

**Files:** Modify `lib/reply-sweep.ts`.

**Consumes:** `isDeclineMessage` (Task 1); `getAIReply`, `fetchKnowledgeBaseContext` from `@/lib/ai-reply`; `createAdminClient`.
**Produces:**
- `interface SweepRow { conversation_id, workspace_id, contact_id, phone, name, last_content, last_at, phone_number_id, access_token, settings, business_name, bh }`
- `findUnansweredConversations(supabase, opts: { minAgeMinutes: number; windowHours: number; limit: number }): Promise<SweepRow[]>`
- `sendCatchupReply(supabase, row: SweepRow): Promise<'sent'|'skipped'|'failed'>`

- [ ] **Step 1: Implement `findUnansweredConversations`** — coarse gates in SQL; content decline-filter applied in code.
```ts
export async function findUnansweredConversations(supabase: any, opts: { minAgeMinutes: number; windowHours: number; limit: number }): Promise<SweepRow[]> {
  const { rows } = await (supabase as any).rpc ? { rows: [] } : { rows: [] }; // not used; see raw query below
  const sql = `
    with latest as (
      select distinct on (m.conversation_id)
        m.conversation_id, m.content last_content, m.created_at last_at, m.direction, cv.contact_id, cv.workspace_id
      from messages m join conversations cv on cv.id = m.conversation_id
      where m.created_at between now() - ($1||' hours')::interval and now() - ($2||' minutes')::interval
      order by m.conversation_id, m.created_at desc
    )
    select l.conversation_id, l.workspace_id, l.contact_id, ct.phone, ct.name, l.last_content, l.last_at,
           w.phone_number_id, w.access_token, w.settings, w.name business_name
    from latest l
    join conversations cv on cv.id = l.conversation_id
    join contacts ct on ct.id = l.contact_id
    join workspaces w on w.id = l.workspace_id
    where l.direction = 'inbound'
      and cv.status = 'open' and coalesce(cv.bot_paused,false) = false
      and coalesce(ct.is_blocked,false) = false and coalesce(ct.opted_out,false) = false
      and w.phone_number_id is not null and w.access_token is not null
      and coalesce(w.settings->>'agent_persona','') <> ''
      and not exists (select 1 from messages o where o.conversation_id = l.conversation_id and o.direction='outbound' and o.created_at >= l.last_at)
      and not exists (select 1 from flow_sessions fs where fs.conversation_id = l.conversation_id and fs.status='active')
    order by l.last_at asc
    limit $3`;
  // executed via the shared pg pool used elsewhere for raw SQL, OR via supabase-js if available.
  const res = await (supabase as any).__rawQuery
    ? (supabase as any).__rawQuery(sql, [opts.windowHours, opts.minAgeMinutes, opts.limit])
    : null;
  const list: SweepRow[] = (res?.rows ?? []) as SweepRow[];
  return list.filter((r) => !isDeclineMessage(r.last_content));
}
```
> NOTE for implementer: the codebase's admin client is `@supabase/supabase-js` (PostgREST), which cannot run this arbitrary SQL/`distinct on`. Implement the query with the **`pg`** package against `process.env.SUPABASE_DB_URL` (already a dependency; used by cron-style server code). Open a short-lived `pg.Client`, run the parameterized query, close it. Do NOT use the supabase-js client for this query. Keep the decline-filter (`isDeclineMessage`) in code as shown.

- [ ] **Step 2: Implement `sendCatchupReply`** (idempotency re-check → business hours → getAIReply → send → record).
```ts
import { getAIReply, fetchKnowledgeBaseContext } from '@/lib/ai-reply';

export async function sendCatchupReply(supabase: any, row: SweepRow): Promise<'sent'|'skipped'|'failed'> {
  try {
    // idempotency re-check: skip if a reply now exists after the customer's last message
    const { data: later } = await supabase.from('messages').select('id')
      .eq('conversation_id', row.conversation_id).eq('direction','outbound')
      .gte('created_at', row.last_at).limit(1);
    if (later && later.length) return 'skipped';

    const token = String(row.access_token).replace(/﻿/g,'').replace(/﻿/g,'').trim();
    const name = row.name && row.name !== row.phone ? (row.name.split(' ')[0] ?? row.name) : 'there';
    const settings = (row.settings ?? {}) as Record<string, unknown>;

    // conversation history (last 40, oldest→newest)
    const { data: hist } = await supabase.from('messages').select('content, sender_type')
      .eq('conversation_id', row.conversation_id).order('created_at', { ascending: false }).limit(40);
    const history = ((hist ?? []) as Array<{content:string; sender_type:string}>).reverse()
      .map((m) => ({ role: m.sender_type === 'contact' ? 'user' as const : 'assistant' as const, content: m.content ?? '' }))
      .filter((m) => m.content.length > 0);

    const kb = await fetchKnowledgeBaseContext(supabase, row.workspace_id, row.last_content).catch(() => '');
    const reply = await getAIReply(row.last_content, name, kb, undefined, settings, row.business_name || 'our team', history);
    if (!reply) return 'failed';

    const res = await fetch(`https://graph.facebook.com/v19.0/${row.phone_number_id}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product:'whatsapp', recipient_type:'individual', to: row.phone, type:'text', text:{ preview_url:false, body: reply } }),
    });
    const data = await res.json();
    const wamid = data?.messages?.[0]?.id ?? null;
    if (!res.ok || !wamid) { console.error('[ReplySweep] send failed', JSON.stringify(data?.error ?? data).slice(0,150)); return 'failed'; }

    const now = new Date().toISOString();
    await supabase.from('messages').insert({ conversation_id: row.conversation_id, workspace_id: row.workspace_id,
      sender_type:'bot', sender_id:null, direction:'outbound', type:'text', content: reply, status:'sent', whatsapp_msg_id: wamid, created_at: now });
    await supabase.from('conversations').update({ last_message: reply, last_message_at: now }).eq('id', row.conversation_id);
    return 'sent';
  } catch (e) {
    console.error('[ReplySweep] error', (e as Error).message);
    return 'failed';
  }
}
```
> Business-hours handling: fetch `business_hours` for the workspace; if `is_enabled` and outside hours, send `away_message` (same send+record) and return `sent` — the implementer adds this using the existing `isWithinBusinessHours`/`BusinessHoursConfig` from `@/app/api/business-hours/route`. Keep it a small block before the getAIReply call.

- [ ] **Step 3: Verify against live DB** — a one-off script (scratchpad) that calls `findUnansweredConversations` and prints `{count}` + sample rows. Confirm it returns only open/unanswered/in-window rows and excludes decline/blocked. (No unit test — integration.) `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit** — `git add lib/reply-sweep.ts && git commit -m "feat(watchdog): find unanswered conversations + send catch-up reply"`

---

### Task 3: Cron endpoint + migration

**Files:** Create `app/api/cron/reply-sweep/route.ts`; Create `database/migrations/057_reply_sweep_cron.sql`.

- [ ] **Step 1: Endpoint** (mirror `app/api/cron/check-sla-breaches/route.ts` auth).
```ts
// app/api/cron/reply-sweep/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { findUnansweredConversations, sendCatchupReply } from '@/lib/reply-sweep';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient() as any;
  const rows = await findUnansweredConversations(supabase, { minAgeMinutes: 2, windowHours: 24, limit: 200 });
  let sent = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const r = await sendCatchupReply(supabase, row);
    if (r === 'sent') sent++; else if (r === 'skipped') skipped++; else failed++;
    await new Promise((res) => setTimeout(res, 150)); // gentle pacing
  }
  return NextResponse.json({ scanned: rows.length, sent, skipped, failed });
}
export async function POST(request: NextRequest) { return run(request); }
export async function GET(request: NextRequest) { return run(request); }
```

- [ ] **Step 2: Migration** (mirror `052`/`055` pg_cron style).
```sql
-- ── 057_reply_sweep_cron.sql ─────────────────────────────────────────────────
-- Missed-reply watchdog: every 3 minutes, POST the reply-sweep endpoint which
-- answers any customer whose latest message went unanswered (all workspaces).
-- Mirrors the sla-breach-check job; uses the same app.base_url / app.cron_secret.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('missed-reply-sweep') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='missed-reply-sweep');

SELECT cron.schedule('missed-reply-sweep', '*/3 * * * *', $$
  SELECT net.http_post(
    url     := current_setting('app.base_url', true) || '/api/cron/reply-sweep',
    headers := ('{"Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '","Content-Type":"application/json"}')::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
$$);
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` and `npx next build` succeed; `/api/cron/reply-sweep` appears in the route list. Manually `curl`/Invoke a `GET` with the `CRON_SECRET` header against the deployed URL after deploy and confirm a `{scanned,sent,skipped,failed}` JSON (and a 401 without the header).

- [ ] **Step 4: Commit** — `git add app/api/cron/reply-sweep/route.ts database/migrations/057_reply_sweep_cron.sql && git commit -m "feat(watchdog): reply-sweep cron endpoint + schedule"`

---

## Final verification
- [ ] `npx vitest run` green; `npx tsc --noEmit` clean; `npx next build` clean.
- [ ] Live `findUnansweredConversations` returns sane rows (integration check).
- [ ] After deploy + migration + one manual authorized run: previously-unanswered customers get a reply; a second immediate run reports mostly `skipped` (idempotency holds — no double replies).

## Self-review notes
- Spec §3.1 → Task 1 (`isDeclineMessage`) + Task 2 (`findUnansweredConversations`); §3.1 `sendCatchupReply` + idempotency + business hours → Task 2. §3.2 endpoint → Task 3 Step 1. §3.3 migration → Task 3 Step 2. §6 testing → Task 1 unit + integration checks. §7 rollout → Final verification.
- Types (`SweepRow`, function signatures) defined once in Task 2 and reused by Task 3.
- Note: the raw-SQL note in Task 2 Step 1 explicitly directs `pg` (not supabase-js) — the pseudo `__rawQuery` line is a placeholder the implementer replaces with a real short-lived `pg.Client`; flagged clearly so it isn't shipped as-is.

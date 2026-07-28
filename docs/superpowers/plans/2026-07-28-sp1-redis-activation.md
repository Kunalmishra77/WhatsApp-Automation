# SP1 — Redis Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the already-integrated Upstash Redis to cache the per-webhook workspace lookup and add real webhook idempotency, with every path fail-open so behavior is unchanged when Redis is absent or down.

**Architecture:** Three small `lib/` modules — a shared client getter (`redis.ts`), a workspace cache (`workspace-cache.ts`), and webhook idempotency (`webhook-idempotency.ts`). Each cache/idempotency function takes the Redis client as an optional injected parameter (default `getRedis()`) so it is unit-testable with a fake and degrades to DB/no-op on any failure. The WhatsApp webhook route consumes them; a migration drops the unused dedup index.

**Tech Stack:** TypeScript, Next.js (App Router), `@upstash/redis` (already a dependency), Supabase JS admin client, Vitest.

## Global Constraints

- Every Redis interaction MUST fail open: on missing config or any thrown error, fall back to the DB (cache) or treat as "not processed" / no-op (idempotency). No path may block or drop a webhook.
- Redis key prefix: `agentix:`. Keys: `agentix:ws:id:<id>`, `agentix:ws:pnid:<phoneNumberId>`, `agentix:wh:<idemKey>`.
- Workspace cache TTL = 60 seconds. Idempotency TTL = 86400 seconds (24h).
- Do not change rate-limiting behavior; only refactor it to consume the shared `getRedis()`.
- Tests use dependency-injected fakes — no network, no real Redis, no `vitest.mock` of `@upstash/redis`.
- Run `npx vitest run` after each task; keep the whole suite green. Final gates: `npx tsc --noEmit` and `npx next build`.

---

### Task 1: Shared Redis client (`lib/redis.ts`) + refactor rate-limit

**Files:**
- Create: `lib/redis.ts`
- Modify: `lib/rate-limit.ts:1-13` (remove its private `getRedis`, import the shared one)
- Test: `tests/redis.test.ts`

**Interfaces:**
- Produces: `getRedis(): Redis | null` — returns a memoized Upstash client, or `null` when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are unset. `resetRedisClientForTests(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/redis.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getRedis, resetRedisClientForTests } from '../lib/redis';

describe('getRedis', () => {
  beforeEach(() => resetRedisClientForTests());

  it('returns null when Upstash env vars are absent', () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(getRedis()).toBeNull();
  });

  it('memoizes: repeated calls return the same value', () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect(getRedis()).toBe(getRedis());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/redis.test.ts`
Expected: FAIL — cannot find module `../lib/redis`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/redis.ts
import { Redis } from '@upstash/redis';

let client: Redis | null | undefined;

/** Shared Upstash Redis client. Returns null when env is unconfigured (fail-open). */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

/** Test-only: clears the memoized client so env changes take effect. */
export function resetRedisClientForTests(): void {
  client = undefined;
}

/** Minimal shape the cache/idempotency helpers rely on (also satisfied by the real client). */
export interface RedisLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts?: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/redis.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `lib/rate-limit.ts` to use the shared getter**

Replace lines 1-13 (its imports + private `getRedis`) with:

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from '@/lib/redis';
```

Delete the local `let redis` / `function getRedis()` block. The rest of the file already calls `getRedis()`, so it now uses the shared one unchanged.

- [ ] **Step 6: Verify nothing broke**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/redis.ts lib/rate-limit.ts tests/redis.test.ts
git commit -m "feat(redis): shared Upstash client getter; rate-limit uses it"
```

---

### Task 2: Webhook idempotency (`lib/webhook-idempotency.ts`)

**Files:**
- Create: `lib/webhook-idempotency.ts`
- Test: `tests/webhook-idempotency.test.ts`

**Interfaces:**
- Consumes: `RedisLike`, `getRedis` from `@/lib/redis`.
- Produces:
  - `webhookIdemKey(signature: string | null | undefined, metaMessageIds: string[]): string`
  - `isWebhookProcessed(key: string, redis?: RedisLike | null): Promise<boolean>`
  - `markWebhookProcessed(key: string, redis?: RedisLike | null): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/webhook-idempotency.test.ts
import { describe, expect, it } from 'vitest';
import { webhookIdemKey, isWebhookProcessed, markWebhookProcessed } from '../lib/webhook-idempotency';

function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
  };
}
const throwingRedis = { get: async () => { throw new Error('down'); }, set: async () => { throw new Error('down'); }, del: async () => {} };

describe('webhookIdemKey', () => {
  it('uses the signature when present', () => {
    expect(webhookIdemKey('sha256=abc', ['m1'])).toBe('sha256=abc');
  });
  it('falls back to a stable hash of sorted ids when no signature', () => {
    const a = webhookIdemKey('', ['m2', 'm1']);
    const b = webhookIdemKey(null, ['m1', 'm2']);
    expect(a).toBe(b);
    expect(a.startsWith('h:')).toBe(true);
  });
});

describe('isWebhookProcessed / markWebhookProcessed', () => {
  it('is false before marking, true after', async () => {
    const r = fakeRedis();
    expect(await isWebhookProcessed('k1', r)).toBe(false);
    await markWebhookProcessed('k1', r);
    expect(await isWebhookProcessed('k1', r)).toBe(true);
  });
  it('returns false when redis is null (fail-open)', async () => {
    expect(await isWebhookProcessed('k1', null)).toBe(false);
  });
  it('returns false when redis throws (fail-open)', async () => {
    expect(await isWebhookProcessed('k1', throwingRedis)).toBe(false);
  });
  it('mark never throws when redis throws', async () => {
    await expect(markWebhookProcessed('k1', throwingRedis)).resolves.toBeUndefined();
  });
  it('empty key is treated as not processed', async () => {
    expect(await isWebhookProcessed('', fakeRedis())).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/webhook-idempotency.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/webhook-idempotency.ts
import crypto from 'crypto';
import { getRedis, type RedisLike } from '@/lib/redis';

const TTL_SECONDS = 60 * 60 * 24; // 24h — covers Meta's retry window

/**
 * Stable key for one webhook delivery. Prefers the x-hub-signature-256 (Meta's
 * HMAC of the exact body — a retry carries the identical signature). Falls back
 * to a hash of the sorted message ids so batched deliveries key as a unit.
 */
export function webhookIdemKey(signature: string | null | undefined, metaMessageIds: string[]): string {
  const sig = signature?.trim();
  if (sig) return sig;
  const basis = [...metaMessageIds].sort().join(',');
  return 'h:' + crypto.createHash('sha256').update(basis).digest('hex');
}

export async function isWebhookProcessed(key: string, redis: RedisLike | null = getRedis()): Promise<boolean> {
  if (!redis || !key) return false;
  try {
    return (await redis.get(`agentix:wh:${key}`)) !== null;
  } catch {
    return false; // fail-open: process normally
  }
}

export async function markWebhookProcessed(key: string, redis: RedisLike | null = getRedis()): Promise<void> {
  if (!redis || !key) return;
  try {
    await redis.set(`agentix:wh:${key}`, 1, { ex: TTL_SECONDS });
  } catch {
    /* fail-open: leave unmarked so a retry reprocesses */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/webhook-idempotency.test.ts`
Expected: PASS (all 8 assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/webhook-idempotency.ts tests/webhook-idempotency.test.ts
git commit -m "feat(redis): webhook idempotency helpers (signature-keyed, fail-open)"
```

---

### Task 3: Workspace cache (`lib/workspace-cache.ts`)

**Files:**
- Create: `lib/workspace-cache.ts`
- Test: `tests/workspace-cache.test.ts`

**Interfaces:**
- Consumes: `RedisLike`, `getRedis` from `@/lib/redis`; a Supabase-like client exposing `.from(t).select(cols).eq(col, val)` resolving to `{ data, error }`.
- Produces:
  - `interface WorkspaceCacheRow { id: string; phone_number_id: string | null; access_token: string | null; name: string | null; settings: Record<string, unknown> | null; }`
  - `getWorkspaceByPhoneNumberId(supabase, phoneNumberId: string | null, redis?): Promise<WorkspaceCacheRow | null>`
  - `getWorkspaceById(supabase, id: string, redis?): Promise<WorkspaceCacheRow | null>`
  - `invalidateWorkspace(keys: { id?: string; phoneNumberId?: string | null }, redis?): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workspace-cache.test.ts
import { describe, expect, it } from 'vitest';
import { getWorkspaceByPhoneNumberId, getWorkspaceById, invalidateWorkspace } from '../lib/workspace-cache';

function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
  };
}
// Supabase-like builder: .from().select().eq() resolves to { data, error }.
function fakeSupabase(result: { data: unknown; error: unknown }, onCall?: () => void) {
  return { from: () => ({ select: () => ({ eq: () => { onCall?.(); return Promise.resolve(result); } }) }) };
}
const row = { id: 'w1', phone_number_id: 'p1', access_token: 't', name: 'WS', settings: { a: 1 } };

describe('getWorkspaceByPhoneNumberId', () => {
  it('returns the DB row on a miss and backfills both cache keys', async () => {
    const r = fakeRedis();
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [row], error: null }), 'p1', r);
    expect(got).toEqual(row);
    expect(r.store.get('agentix:ws:pnid:p1')).toBeTruthy();
    expect(r.store.get('agentix:ws:id:w1')).toBeTruthy();
  });

  it('returns the cached row without hitting the DB on a hit', async () => {
    const r = fakeRedis();
    r.store.set('agentix:ws:pnid:p1', JSON.stringify(row));
    let dbCalled = false;
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [row], error: null }, () => { dbCalled = true; }), 'p1', r);
    expect(got).toEqual(row);
    expect(dbCalled).toBe(false);
  });

  it('does NOT cache an ambiguous (multiple-row) result and returns null', async () => {
    const r = fakeRedis();
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [row, { ...row, id: 'w2' }], error: null }), 'p1', r);
    expect(got).toBeNull();
    expect(r.store.size).toBe(0);
  });

  it('falls back to the DB when redis.get throws', async () => {
    const throwing = { get: async () => { throw new Error('down'); }, set: async () => {}, del: async () => {} };
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [row], error: null }), 'p1', throwing);
    expect(got).toEqual(row);
  });

  it('returns null for a null phoneNumberId', async () => {
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [], error: null }), null, fakeRedis());
    expect(got).toBeNull();
  });
});

describe('getWorkspaceById', () => {
  it('returns the DB row on a miss and caches it', async () => {
    const r = fakeRedis();
    const got = await getWorkspaceById(fakeSupabase({ data: [row], error: null }), 'w1', r);
    expect(got).toEqual(row);
    expect(r.store.get('agentix:ws:id:w1')).toBeTruthy();
  });
});

describe('invalidateWorkspace', () => {
  it('deletes both cache keys', async () => {
    const r = fakeRedis();
    r.store.set('agentix:ws:id:w1', '{}');
    r.store.set('agentix:ws:pnid:p1', '{}');
    await invalidateWorkspace({ id: 'w1', phoneNumberId: 'p1' }, r);
    expect(r.store.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workspace-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/workspace-cache.ts
import { getRedis, type RedisLike } from '@/lib/redis';

const TTL_SECONDS = 60;
const SELECT = 'id, phone_number_id, access_token, name, settings';

export interface WorkspaceCacheRow {
  id: string;
  phone_number_id: string | null;
  access_token: string | null;
  name: string | null;
  settings: Record<string, unknown> | null;
}

function parse(value: unknown): WorkspaceCacheRow | null {
  if (!value) return null;
  try {
    return typeof value === 'string' ? (JSON.parse(value) as WorkspaceCacheRow) : (value as WorkspaceCacheRow);
  } catch {
    return null;
  }
}

async function readCache(redis: RedisLike | null, key: string): Promise<WorkspaceCacheRow | null> {
  if (!redis) return null;
  try {
    return parse(await redis.get(key));
  } catch {
    return null;
  }
}

async function writeCache(redis: RedisLike | null, row: WorkspaceCacheRow): Promise<void> {
  if (!redis) return;
  const payload = JSON.stringify(row);
  try {
    await redis.set(`agentix:ws:id:${row.id}`, payload, { ex: TTL_SECONDS });
    if (row.phone_number_id) await redis.set(`agentix:ws:pnid:${row.phone_number_id}`, payload, { ex: TTL_SECONDS });
  } catch {
    /* fail-open */
  }
}

// Exactly-one-row semantics mirror the app's `.single()` expectation: 0 or >1 rows -> null (and not cached).
function pickSingle(data: unknown): WorkspaceCacheRow | null {
  return Array.isArray(data) && data.length === 1 ? (data[0] as WorkspaceCacheRow) : null;
}

export async function getWorkspaceByPhoneNumberId(
  supabase: any, phoneNumberId: string | null, redis: RedisLike | null = getRedis(),
): Promise<WorkspaceCacheRow | null> {
  if (!phoneNumberId) return null;
  const cached = await readCache(redis, `agentix:ws:pnid:${phoneNumberId}`);
  if (cached) return cached;
  const { data } = await supabase.from('workspaces').select(SELECT).eq('phone_number_id', phoneNumberId);
  const row = pickSingle(data);
  if (row) await writeCache(redis, row);
  return row;
}

export async function getWorkspaceById(
  supabase: any, id: string, redis: RedisLike | null = getRedis(),
): Promise<WorkspaceCacheRow | null> {
  if (!id) return null;
  const cached = await readCache(redis, `agentix:ws:id:${id}`);
  if (cached) return cached;
  const { data } = await supabase.from('workspaces').select(SELECT).eq('id', id);
  const row = pickSingle(data);
  if (row) await writeCache(redis, row);
  return row;
}

export async function invalidateWorkspace(
  keys: { id?: string; phoneNumberId?: string | null }, redis: RedisLike | null = getRedis(),
): Promise<void> {
  if (!redis) return;
  try {
    if (keys.id) await redis.del(`agentix:ws:id:${keys.id}`);
    if (keys.phoneNumberId) await redis.del(`agentix:ws:pnid:${keys.phoneNumberId}`);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workspace-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/workspace-cache.ts tests/workspace-cache.test.ts
git commit -m "feat(redis): workspace cache (60s TTL, exactly-one-row, fail-open)"
```

---

### Task 4: Wire cache + idempotency into the webhook route and settings save

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts` (POST handler top ~line 60-105; workspace lookups at ~75, ~212, ~1234)
- Modify: `app/api/settings/workspace/route.ts` (after a successful settings update)

**Interfaces:**
- Consumes: `getWorkspaceByPhoneNumberId`, `getWorkspaceById`, `invalidateWorkspace` (Task 3); `webhookIdemKey`, `isWebhookProcessed`, `markWebhookProcessed` (Task 2); existing `extractMetaMessageIds(payload)` in the route.

> No unit test: this handler is a large integration surface with many dependencies. It is verified by `tsc` + `next build` and by the unit-tested modules it calls. The wiring is guarded so a Redis miss/error is identical to today.

- [ ] **Step 1: Add imports to the webhook route**

At the top of `app/api/webhooks/whatsapp/route.ts`, add:

```ts
import { getWorkspaceByPhoneNumberId } from '@/lib/workspace-cache';
import { webhookIdemKey, isWebhookProcessed, markWebhookProcessed } from '@/lib/webhook-idempotency';
```

- [ ] **Step 2: Idempotency short-circuit at the top of POST**

In the `POST` handler, immediately after `payload` and `signature` are known and BEFORE `recordWebhookEvent`, insert:

```ts
  const idemKey = webhookIdemKey(signature, extractMetaMessageIds(payload));
  if (await isWebhookProcessed(idemKey)) {
    return NextResponse.json({ status: 'ok', deduped: true }, { status: 200 });
  }
```

Then, in the existing `try` block, on the success line right after `await markWebhookEvent(supabase, eventId, 'processed');`, add:

```ts
    await markWebhookProcessed(idemKey);
```

- [ ] **Step 3: Replace the signature-check workspace lookup (~line 73-77)**

Replace:

```ts
    const { data: ws } = await db
      .from('workspaces')
      .select('settings')
      .eq('phone_number_id', phoneNumberId)
      .single();
    const appSecret: string | undefined = ws?.settings?.app_secret;
```

with:

```ts
    const ws = await getWorkspaceByPhoneNumberId(db, phoneNumberId);
    const appSecret = (ws?.settings as Record<string, unknown> | undefined)?.app_secret as string | undefined;
```

- [ ] **Step 4: Replace the message-processing workspace lookup (~line 210-214)**

Find the `.from('workspaces')...eq('phone_number_id', phoneNumberId)` lookup used to resolve the workspace for an inbound message and replace it with `const ws = await getWorkspaceByPhoneNumberId(supabase, phoneNumberId);` reusing the returned fields (`ws.id`, `ws.settings`, `ws.access_token`, `ws.name`). Preserve the existing "no workspace" branch by checking `if (!ws) { ... existing no-workspace handling ... }`.

- [ ] **Step 5: Add cache invalidation to the settings save route**

In `app/api/settings/workspace/route.ts`, import and call invalidation after a successful update:

```ts
import { invalidateWorkspace } from '@/lib/workspace-cache';
// ...after the workspace update succeeds, with the workspace id + its phone_number_id in scope:
await invalidateWorkspace({ id: workspaceId, phoneNumberId: updatedPhoneNumberId ?? null });
```

If `phone_number_id` is not in scope there, pass `{ id: workspaceId }` — the 60s TTL covers the pnid key.

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit` then `npx next build`
Expected: no type errors; build succeeds; `/api/webhooks/whatsapp` and `/api/settings/workspace` compile.

- [ ] **Step 7: Commit**

```bash
git add app/api/webhooks/whatsapp/route.ts app/api/settings/workspace/route.ts
git commit -m "feat(redis): use workspace cache + webhook idempotency in webhook route"
```

---

### Task 5: Migration — drop the unused dedup index

**Files:**
- Create: `database/migrations/056_drop_unused_webhook_index.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ── 056_drop_unused_webhook_index.sql ────────────────────────────────────────
-- The GIN index on whatsapp_webhook_events.meta_message_ids was never queried
-- (0 scans; ~24 MB). Deduplication is now handled in Redis (signature-keyed
-- idempotency, see lib/webhook-idempotency.ts). Drop the dead index. The
-- meta_message_ids column is retained (cheap) to avoid a table rewrite.
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_whatsapp_webhook_events_message_ids;
```

- [ ] **Step 2: Verify SQL is well-formed**

Run: `type database\migrations\056_drop_unused_webhook_index.sql` (Windows) — confirm the single `DROP INDEX IF EXISTS` statement. (Applied to prod later via the Supabase SQL editor, or by the maintainer running the DROP directly — it is safe and idempotent.)

- [ ] **Step 3: Commit**

```bash
git add database/migrations/056_drop_unused_webhook_index.sql
git commit -m "chore(db): drop unused meta_message_ids GIN index (superseded by Redis idempotency)"
```

---

## Final verification (after all tasks)

- [ ] `npx vitest run` — full suite green (existing + redis + idempotency + workspace-cache).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx next build` — succeeds.
- [ ] Deploy is safe with Upstash env absent (behavior unchanged). After setting `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and redeploying, confirm via `pg_stat_statements` that the per-webhook `workspaces` select count drops sharply, and duplicate Meta retries return `{deduped:true}` without reprocessing.

## Self-Review notes

- **Spec coverage:** redis.ts (§3.1) → Task 1; webhook-idempotency (§3.3) → Task 2; workspace-cache (§3.2) → Task 3; wiring + invalidation (§4) → Task 4; migration (§5) → Task 5; testing (§7) → Tasks 1-3; rollout (§8) → Final verification.
- **Ambiguity handled:** idempotency keyed on signature (delivery-level), matching the corrected spec.
- **Type consistency:** `RedisLike`, `WorkspaceCacheRow`, and all function signatures are defined once (Tasks 1/3) and referenced consistently.

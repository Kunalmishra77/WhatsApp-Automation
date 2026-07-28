# SP1 — Redis Activation (Cache + Idempotency)

**Date:** 2026-07-28
**Part of:** Phase 2 scale work (sub-project 1 of 6). See `docs/architecture/2026-07-28-data-lifecycle-and-scalability.md`.
**Risk:** Low. Every Redis path fail-opens to current behavior, so the app is unaffected whether Redis is present or not.

---

## 1. Problem & goal

Two measured issues in the hot webhook path:

1. **Repeated workspace reads.** `workspaces` is queried by `phone_number_id` / `id` multiple times per inbound webhook (`route.ts:75`, `:212`, `:1234`, plus flow-engine). `pg_stat_statements` showed the `workspaces.settings` select at ~1,225 calls in the sample window — one per webhook. This scales linearly with message volume.
2. **No real deduplication.** The webhook stores `meta_message_ids` but **never queries it** (that GIN index has 0 scans). Duplicate Meta retries are reprocessed; only `messages_whatsapp_msg_id_unique` prevents double rows. Wasted work, and 24 MB of dead index.

**Goal:** Activate the already-integrated Upstash Redis to (a) cache hot workspace reads and (b) add real webhook idempotency — cutting DB load per webhook and closing the dedup gap — with zero risk when Redis is absent.

## 2. Non-goals (YAGNI)

- No caching of anything beyond workspace lookups in v1.
- No full cache-invalidation fan-out (short TTL + one save-route hook instead).
- No queue/job system (that's later sub-projects).
- No change to rate-limiting (already works).

## 3. Components

### 3.1 `lib/redis.ts`
Single shared Upstash client getter, mirroring `lib/rate-limit.ts`:
```ts
export function getRedis(): Redis | null  // null when UPSTASH_* env absent
```
Plus tiny typed helpers: `cacheGet<T>(key)`, `cacheSet(key, val, ttlSec)`, `cacheDel(key)` — each swallows errors and returns a safe default (fail-open). Refactor `rate-limit.ts` to consume this getter (no behavior change).

### 3.2 `lib/workspace-cache.ts`
```ts
getWorkspaceByPhoneNumberId(supabase, phoneNumberId): Promise<WorkspaceCacheRow | null>
getWorkspaceById(supabase, id): Promise<WorkspaceCacheRow | null>
invalidateWorkspace({ id?, phoneNumberId? }): Promise<void>
```
- `WorkspaceCacheRow` = the fields hot paths need: `id, phone_number_id, access_token, name, settings`.
- Read path: Redis GET → hit returns; miss → DB select → backfill Redis with **TTL 60s** → return. On any Redis error, go straight to DB (fail-open).
- Keys: `agentix:ws:pnid:<phoneNumberId>` and `agentix:ws:id:<id>`. Both keys are written on a miss so either lookup warms both.
- **Consistency note:** a phone_number_id shared by multiple workspaces (seen in test data) must NOT be cached ambiguously — if the DB lookup returns ≠1 row, skip caching and return null/So the caller keeps today's behavior. Mirrors the app's `.single()` expectation.

### 3.3 `lib/webhook-idempotency.ts`
```ts
webhookIdemKey(payload, signature): string        // stable key for this exact delivery
isWebhookProcessed(key: string): Promise<boolean>
markWebhookProcessed(key: string): Promise<void>  // set key, 24h TTL
```
- **Key = the webhook signature** (`x-hub-signature-256`, Meta's HMAC of the exact raw body) — a retry of the same delivery carries the identical signature, so this dedups the *whole delivery* atomically and avoids the mixed-batch hazard of per-message keys. Fallback when signature absent: `sha256` of the sorted `meta_message_ids` (or the raw body). Redis key: `agentix:wh:<key>`.
- Semantics: **check at start, set only after successful processing.** A failed webhook does not mark → Meta's retry reprocesses (no lost messages). Concurrent duplicates are backstopped by `messages_whatsapp_msg_id_unique`.
- Fail-open: Redis error → `isWebhookProcessed` returns `false` (process normally), `markWebhookProcessed` no-ops.
- Rationale: keying on a single message id would wrongly skip a batched delivery that mixes already-seen and new messages. The signature keys the delivery as a unit.

## 4. Wiring into the webhook route

- Replace the by-`phone_number_id` and by-`id` workspace selects in `app/api/webhooks/whatsapp/route.ts` with the cache helpers.
- At the start of `POST` (after parsing payload + signature, before heavy processing): compute `key = webhookIdemKey(payload, signature)`; if `isWebhookProcessed(key)` → short-circuit with 200 OK (already handled). After `processPayload` succeeds → `markWebhookProcessed(key)`.
- Invalidate on save: call `invalidateWorkspace()` in the primary settings-save route (`app/api/settings/workspace/route.ts`) after a successful update. Other update paths rely on the 60s TTL.

## 5. Migration

`056_drop_unused_webhook_index.sql`: `DROP INDEX IF EXISTS idx_whatsapp_webhook_events_message_ids;` (24 MB, 0 scans — superseded by Redis idempotency). Keep the `meta_message_ids` column for now (cheap; avoids a rewrite).

## 6. Failure behavior (explicit)

| Redis state | Workspace cache | Idempotency | Result |
|---|---|---|---|
| Not configured (no env) | always DB | always "not processed" | identical to today |
| Configured, healthy | cached (60s) | real dedup | fewer DB reads, no double-processing |
| Configured, down/error | falls to DB | processes normally | identical to today, logs a warning |

No path can block or drop a message on Redis failure.

## 7. Testing

- `tests/workspace-cache.test.ts`: hit returns cached; miss reads DB + backfills; Redis error → DB fallback; ambiguous (≠1 row) → not cached. Redis + supabase mocked.
- `tests/webhook-idempotency.test.ts`: unseen → false; after mark → true; empty ids → false; Redis error → false (fail-open).
- Keep the existing suite green (`vitest run`), `tsc`, and `next build`.

## 8. Rollout

1. Merge with Redis env absent → behavior unchanged (safe to deploy anytime).
2. Provision Upstash + set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in Coolify (ap-south-1).
3. Redeploy → caching + idempotency activate automatically.
4. Verify: `pg_stat_statements` shows the per-webhook workspace select drop sharply; duplicate retries no longer create processing load.

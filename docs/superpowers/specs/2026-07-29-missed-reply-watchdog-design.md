# Missed-Reply Watchdog — Design Spec

**Date:** 2026-07-29
**Goal:** Guarantee that no customer's WhatsApp message goes unanswered for any client — a platform-wide safety net behind the real-time auto-reply, so transient failures (AI timeout, DB blip, campaign-burst overload, crash) never leave a customer waiting.
**Risk:** Low. It only *adds* replies where one is missing; it never modifies the real-time reply path. Idempotent, gated, and window-limited so it cannot double-reply or spam.

---

## 1. Problem (measured)

Over 3 days for one client (Razorveda), 104/317 inbound messages got **no reply** — **56% of button taps** vs 17% of text, clustered around campaign bursts and yesterday's DB overload. The real-time path (`handleIncomingMessage` → `sendAutoReply`) fails silently under load with **no retry**. This can happen to any client.

## 2. Approach

A scheduled sweep that finds conversations where the customer's latest message is unanswered and sends the reply the bot *should* have sent — reusing the existing shared AI core (`getAIReply` + `fetchKnowledgeBaseContext` from `lib/ai-reply.ts`), so the reply matches each workspace's persona/KB. **No changes to the webhook route** (the hot path stays untouched → zero regression risk).

Backstop scope: it reproduces the *core* contextual reply (KB + history + persona), not the conversation-stage specializations (payment-screenshot, order-intent scanner). Those only matter mid-conversation; when the real path failed entirely, a correct contextual reply is strictly better than silence, and for the common case (first-touch "Shop Now"/"Hi") it's exactly the intended reply.

## 3. Components

### 3.1 `lib/reply-sweep.ts`
- `findUnansweredConversations(supabase, { minAgeMinutes, windowHours, limit }): Promise<SweepRow[]>`
  Returns conversations needing a catch-up reply. A row qualifies when ALL hold:
  - The **latest** message in the conversation is **inbound** (customer), `created_at` between `now()-windowHours` and `now()-minAgeMinutes`.
  - **No outbound** message exists after that inbound (bot or agent).
  - `conversations.status = 'open'` AND `bot_paused = false`.
  - `contacts.is_blocked = false` AND `opted_out = false`.
  - **No active `flow_sessions`** for the conversation (a flow is handling it).
  - Workspace has `phone_number_id`, `access_token`, and a non-empty `settings.agent_persona`.
  - The inbound content is **not a decline/stop signal** (`not interested`, `stop`, `unsubscribe`, `band karo`, `mat bhejo`) — case-insensitive.
  `SweepRow = { conversation_id, workspace_id, contact_id, phone, name, last_content, phone_number_id, access_token, settings, business_name }`.
- `sendCatchupReply(supabase, row): Promise<'sent'|'skipped'|'failed'>`
  1. **Re-check idempotency** at send time: abort (`skipped`) if any outbound now exists after the customer's last message (the real path may have caught up).
  2. Respect **business hours**: if configured and outside hours, send the workspace's away message instead (once) and return.
  3. Build history (last ~40 msgs) + `fetchKnowledgeBaseContext(...)`, call `getAIReply(last_content, name, kbContext, undefined, settings, business_name, history)`.
  4. Send via WhatsApp Graph API; on success **record** the outbound message (`sender_type='bot'`, `direction='outbound'`, status `'sent'`, `whatsapp_msg_id`) and update the conversation's `last_message`/`last_message_at`.
  Fail-safe: any error → `failed`, logged, never throws.

### 3.2 `app/api/cron/reply-sweep/route.ts`
- `POST` (and `GET` for manual/cron), authorized by `Authorization: Bearer <CRON_SECRET>` (same pattern as `check-sla-breaches`). Reject otherwise with 401.
- Calls `findUnansweredConversations(supabase, { minAgeMinutes: 2, windowHours: 24, limit: 200 })`, then `sendCatchupReply` for each **sequentially** (avoid hammering the AI/WhatsApp APIs), with a small per-send delay.
- Returns `{ scanned, sent, skipped, failed }`.
- `export const dynamic = 'force-dynamic'` / `runtime = 'nodejs'` per existing cron routes.

### 3.3 Migration `057_reply_sweep_cron.sql`
- pg_cron job `missed-reply-sweep`, schedule `*/3 * * * *` (every 3 min), calling the endpoint via `net.http_post` with the `CRON_SECRET` — mirroring the existing `sla-breach-check` job exactly (same `app.base_url` / `app.cron_secret` settings).

## 3.4 Non-goals / v1 limits (YAGNI)
- Does **not** replicate payment-screenshot / order-intent / media specializations (backstop sends the core contextual reply).
- Does **not** apply the plan message-limit guard in v1 (missed replies are low-volume and mostly enterprise clients; add if a plan-limited client ever needs it).
- Does **not** touch or refactor the webhook route.

## 4. Parameters
- Sweep interval: **3 min**. Reply threshold (`minAgeMinutes`): **2 min** (well behind the instant path). Window: **24h** (Meta free-form limit). Batch limit: **200/run**.

## 5. Failure behavior
- Endpoint auth fails → 401, no action.
- AI or WhatsApp send fails for a row → that row `failed`, logged; the sweep continues; the row is retried on the next sweep (still unanswered) until the 24h window closes.
- Idempotency re-check prevents double-replies when the real path and the sweep overlap.
- The sweep never modifies or blocks the real-time path.

## 6. Testing
- `tests/reply-sweep.test.ts` — pure unit tests for the **qualifying/decline/idempotency predicates** using injected fake rows: qualifies when unanswered+open+in-window; excluded when bot_paused / blocked / opted_out / has-later-outbound / decline-signal / has-active-flow / outside-window. (AI + WhatsApp calls are integration, not unit-tested; verified via a manual authorized `GET` against staging and by watching `{scanned,sent}` on the first live runs.)
- `tsc` + `next build` clean; existing suite green.

## 7. Rollout
1. Merge (no effect until the cron is scheduled).
2. Deploy; apply migration `057`; confirm `app.base_url`/`app.cron_secret` DB settings are set (already used by `sla-breach-check`).
3. Manually hit the endpoint once (authorized) and check `{scanned,sent}` looks sane.
4. Watch the first few automated runs; confirm no double-replies and that previously-missed customers get answered.

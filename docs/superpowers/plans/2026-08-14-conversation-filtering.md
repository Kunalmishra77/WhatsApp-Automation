# Conversation Filtering + Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Server-side, uncapped conversation filtering (date/campaign/temperature/flags/assigned/labels/sentiment/search) + a filter-aware reporting summary bar, replacing the client-side text search.

**Architecture:** Migration 069 denormalizes `conversations.source_campaign_id` (+ backfill + indexes). A new `GET /api/conversations/search` builds the filtered, paginated, uncapped query server-side (admin client, workspace-scoped) + returns summary counts. The Conversations UI gets a filter bar + summary strip and fetches the new API instead of the direct supabase query.

**Tech Stack:** Next.js 15 routes, Supabase Postgres, TypeScript, Vitest, Tailwind. Reuses `lib/date-range.ts` (Project 0).

## Global Constraints

- **Server-side + uncapped**: `total` and every summary count via `count:'exact', head:true` (never `.select().length`). Date range via `resolveRange` (IST, `.gte(fromUtc).lt(toUtc)`).
- **Every query workspace-scoped** (`.eq('workspace_id', workspaceId)`); API permission-gated; admin client server-side only.
- **Definitions**: `unread` = `unread_count > 0`; `unanswered` = `first_replied_at IS NULL` (we've never replied — indexable; note: distinct from the reply-sweep's "latest msg inbound"); `replied` = `first_replied_at IS NOT NULL`; `spam` = `is_spam`.
- The webhook hot path (`app/api/webhooks/whatsapp/route.ts`) must not be destabilized — the `source_campaign_id` stamp there is fail-open and must not alter reply behavior.
- Windows: Bash tool for `npx tsc --noEmit`, `npx vitest run`, `git`. Do NOT run `npx next build`.

---

### Task 1: Migration 069 — source_campaign_id + backfill + indexes

**Files:** Create `database/migrations/069_conversation_filtering.sql`.

- [ ] **Step 1:** Verify `leads.conversation_id`, `campaign_recipients.(campaign_id, conversation_id, sent_at)`, `conversations.first_replied_at` exist (grep migrations). Then write:

```sql
-- 069_conversation_filtering.sql — denormalized campaign source + filter indexes.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS source_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_ws_campaign ON public.conversations (workspace_id, source_campaign_id);
CREATE INDEX IF NOT EXISTS idx_conversations_ws_created ON public.conversations (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_ws_firstreplied ON public.conversations (workspace_id, first_replied_at);
CREATE INDEX IF NOT EXISTS idx_leads_conversation ON public.leads (conversation_id);

-- Backfill: earliest campaign per conversation.
UPDATE public.conversations c
SET source_campaign_id = cr.campaign_id
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, campaign_id
  FROM public.campaign_recipients
  WHERE conversation_id IS NOT NULL
  ORDER BY conversation_id, sent_at ASC NULLS LAST
) cr
WHERE cr.conversation_id = c.id AND c.source_campaign_id IS NULL;
```

- [ ] **Step 2:** Re-read; confirm FK ON DELETE SET NULL, indexes, backfill picks earliest campaign, idempotent (IF NOT EXISTS). No app test.
- [ ] **Step 3: Commit** `feat(conversations): migration 069 — source_campaign_id + backfill + filter indexes`.

---

### Task 2: `GET /api/conversations/search` + webhook campaign stamp

**Files:** Create `app/api/conversations/search/route.ts`. Modify `app/api/webhooks/whatsapp/route.ts` (the campaign-reply block that sets `campaign_recipients.conversation_id` — grep for `pendingCr`/`campaign_recipients` update, ~lines 490-525).

**Interfaces (Consumes):** `resolveRange`, `QuickRange` (`lib/date-range.ts`); `requireWorkspacePermission`/`AuthzError`/`authzResponse` (`lib/authz`); `createAdminClient`.

- [ ] **Step 1 — webhook stamp (small, safe):** in the campaign-reply block where a `pendingCr` (campaign_recipient) is matched and its `conversation_id` is set, ALSO stamp the conversation's source (fire-and-forget, fail-open, only if not already set): `void supabase.from('conversations').update({ source_campaign_id: pendingCr.campaign_id }).eq('id', conversation.id).is('source_campaign_id', null).then(()=>{},()=>{})`. Do NOT change any reply/AI logic or add an `await` that could delay the reply.
- [ ] **Step 2 — search route:** `GET /api/conversations/search`. `runtime='nodejs'`. Auth `requireWorkspacePermission(workspaceId, <existing conversations permission>)` — grep the current conversations API/RLS to match the right permission (e.g. `view_conversations`/`conversations`); `AuthzError→authzResponse`, 500 fallback. Admin client. Parse params: `quick|from|to, channel, status, campaign_id, temperature, stage, flag, assigned_agent_id, label, sentiment, q, limit(default 30), offset(default 0)`.
- [ ] **Step 3 — build the base filtered query** (helper `applyFilters(qb)` reused for the page + counts):
  - always `.eq('workspace_id', workspaceId)`; date → `.gte('created_at', fromUtc).lt('created_at', toUtc)` (only when a range is given; default no date filter = all-time unless `quick` provided — decide: default `last_30_days`? NO — conversations default should be all/recent; use the provided range, else no date filter).
  - `channel`→`.eq`; `status`→`.eq`; `assigned_agent_id`→`.eq`; `sentiment`→`.eq`; `campaign_id`→`.eq('source_campaign_id', campaign_id)`; `label`→`.contains('labels', [label])`; `flag`: `unread`→`.gt('unread_count',0)`, `replied`→`.not('first_replied_at','is',null)`, `unanswered`→`.is('first_replied_at',null)`, `spam`→`.eq('is_spam',true)`.
  - **temperature/stage** (needs the leads join): first fetch matching conversation ids — `select('conversation_id').from('leads').eq('workspace_id',workspaceId).eq('temperature',temperature)` (and/or `.eq('stage',stage)`), dedupe → `ids`; then `.in('id', ids)` on the conversation query (if `ids` empty → return empty result without querying). (Bounded by leads count; acceptable for a filter.)
  - **search `q`**: match contact name/phone OR last_message — `.or('last_message.ilike.%q%,contact_name.ilike.%q%,contact_phone.ilike.%q%')` if those denormalized fields exist on conversations; else join contacts. (Grep the conversations columns; the list already shows contact name/phone — confirm the source. Use FTS `.textSearch('last_message', q, {type:'websearch',config:'english'})` for last_message to hit `idx_conversations_fts`, combined with an ilike on contact fields.)
- [ ] **Step 4 — page + total + summary:** page = base query `.order('last_message_at',{ascending:false}).range(offset, offset+limit-1)` with a `count:'exact'` for `total`. **summary** (respecting the SAME non-flag filters, i.e. the filter context minus the specific flag being counted): run parallel `count:'exact', head:true` for: `new_today`/`new_week`/`new_month` (base filters + `.gte(resolveRange('today'/'this_week'/'this_month').fromUtc)`), `hot`/`warm`/`cold` (base + temperature id-sets), `unanswered` (base + first_replied_at null), `unread` (base + unread_count>0), and `total`. Return `{ conversations, total, summary }`. `Number()` counts. No secrets.
- [ ] **Step 5:** `npx tsc --noEmit` clean. Commit `feat(conversations): server-side search+filter API + campaign-source stamp`.

---

### Task 3: Conversations UI — filter bar + summary strip + rewire list

**Files:** Create `modules/conversations/components/ConversationFilters/index.tsx` + `ConversationSummaryBar/index.tsx`. Modify `modules/conversations/components/ConversationList/index.tsx` + `modules/conversations/hooks/useConversations.ts` (+ `services/conversation.service.ts`).

**Interfaces (Consumes):** `/api/conversations/search` (Task 2); `QUICK_RANGES` (`lib/date-range.ts`).

- [ ] **Step 1 — rewire the list data source:** change `useConversations`/`fetchConversations` to call `GET /api/conversations/search` with the current filter object (react-query keyed on the filter object), instead of the direct browser `supabase.from('conversations')` query. Preserve the existing `ConversationList`→`ChatWindow` selection behavior. Keep the existing status/channel tabs but have them set filter state that feeds the API (server-side now).
- [ ] **Step 2 — filter bar** (`ConversationFilters`): a date-range control (`QUICK_RANGES` + custom), and controls for campaign (list the workspace's campaigns — fetch a lightweight campaigns list), lead temperature (hot/warm/cold), flags (unread/unanswered/replied/spam), assigned agent, labels, sentiment, + a search box (debounced). Active filters render as removable chips with a "Clear all". Changing any filter refetches.
- [ ] **Step 3 — summary strip** (`ConversationSummaryBar`): render `summary` from the API — New today / this week / this month, Hot / Warm / Cold, Unanswered, Unread — small stat tiles, reflecting active filters.
- [ ] **Step 4 — pagination:** "Load more"/infinite scroll using `limit`/`offset` + `total`. Loading/empty ("No conversations match these filters")/error states. Reuse `Card`/`Badge`/`Select`/`Input` primitives. Responsive (filter bar wraps; list scrolls).
- [ ] **Step 5:** `npx tsc --noEmit` clean. Commit `feat(conversations): filter bar + reporting summary + server-side list`.

---

## Post-implementation (controller)

1. Apply migration 069 live (verify backfill: `source_campaign_id` populated for conversations that have a campaign_recipient; spot-check a Razorveda campaign).
2. **Live verification** (Razorveda/Umang): filtered `total` == direct DB count for the same filters (uncapped, >1000 where applicable); campaign filter returns only that campaign's conversations; temperature filter matches the leads join; summary counts (new today/week/month, hot/warm/cold, unanswered, unread) match direct counts; FTS search returns expected rows.
3. Cross-tenant check: search workspace A as a member of B → 403.
4. Whole-branch review (opus) → merge → push → tell user to redeploy.

## Self-Review

- **Spec coverage:** denormalized campaign + backfill + indexes (T1), server-side filter/search API + summary + webhook stamp (T2), filter bar + summary strip + rewired list (T3), live data-accuracy verification (controller). All filter dimensions (date/channel/status/campaign/temperature/stage/flags/assigned/labels/sentiment/search) + reporting summary mapped. All spec sections covered.
- **Placeholders:** none — migration SQL + filter mapping concrete; where a column source is uncertain (contact name/phone on conversations vs contacts) the task says to grep + confirm.
- **Type consistency:** `resolveRange`/`QUICK_RANGES` reused; the filter param names are consistent between the API (T2) and the UI (T3); flag/temperature definitions consistent across page + summary.

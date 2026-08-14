# Conversation Filtering + Reporting (Project 3)

**Date:** 2026-08-14
**Status:** Approved design pending user review, then implementation plan
**Part of:** Platform-Wide Overhaul (Project 3 of 5)

## Problem

The Conversations page has only status tabs, channel tabs, and a **client-side** text search
(searches only the already-loaded rows). Clients can't answer "how many new conversations today
/ this week / this month?", "which came from campaign X?", "how many are hot / unanswered?"
without scrolling thousands of threads. We add **server-side, uncapped filtering** across every
useful dimension plus a **reporting summary bar** — reusing the Project-0 date foundation.

## Decisions

1. **Server-side filtering** — filters become query params → SQL (admin client, workspace-scoped),
   so results + counts are accurate and uncapped (not just the loaded page). Replaces the
   client-side `useMemo` search.
2. **Full filter set** (all computable from real data):
   - **Date range** (Project-0 `resolveRange`: today/yesterday/7d/15d/30d/…/custom/all-time) on
     `conversations.created_at`, IST.
   - **Channel** (whatsapp/instagram) + **status** (open/assigned/pending/resolved/snoozed) —
     already exist, moved server-side.
   - **Campaign source** — which campaign started the conversation (denormalized
     `source_campaign_id`, below).
   - **Lead temperature** (hot/warm/cold) + **stage** (converted/…) — via the linked `leads` row.
   - **Flags**: **unread** (`unread_count > 0`), **unanswered** (latest message is inbound —
     customer waiting), **replied** (`first_replied_at IS NOT NULL`), **spam** (`is_spam`).
   - **Assigned agent** (`assigned_agent_id`), **labels** (array contains), **sentiment**
     (positive/neutral/negative).
   - **Text search** — server-side full-text via the existing `idx_conversations_fts` GIN index
     (replaces the in-memory search).
3. **Reporting summary bar** at the top — counts that **respect the active filters**: matching
   total, **new today / this week / this month**, **hot / warm / cold**, **unanswered**, **unread**.
4. Keep the existing Conversations layout (`ConversationList` + `ChatWindow` + `CustomerPanel`);
   this replaces the list's data source + adds the filter bar and summary strip.

## Data model (migration 069)

- **`conversations.source_campaign_id uuid`** (nullable, FK→`campaigns` ON DELETE SET NULL) +
  index `(workspace_id, source_campaign_id)`. **Backfill** from
  `campaign_recipients (campaign_id, conversation_id)` where `conversation_id IS NOT NULL`
  (a conversation's first/earliest campaign wins; pick `min(campaign_id)` deterministically or the
  earliest `sent_at`). Going forward, the inbound webhook / campaign-reply path already sets
  `campaign_recipients.conversation_id` — also stamp `conversations.source_campaign_id` there
  (Task in plan) so new links are captured.
- **Index `leads(conversation_id)`** if absent (for the temperature/stage join filter).
- No change to existing columns; RLS unchanged (conversations already workspace-scoped via RLS +
  the API uses the admin client with explicit `workspace_id` filters).

## API — `GET /api/conversations/search`

Auth: the conversations page is available to all workspace roles; gate with
`requireWorkspacePermission(workspaceId, 'conversations_view')` (or the existing conversations
permission — match how the current conversations API/RLS gates access). Admin client + explicit
`.eq('workspace_id', workspaceId)`. Query params (all optional):
`quick|from|to, channel, status, campaign_id, temperature, stage, flag(unread|unanswered|replied|spam),
assigned_agent_id, label, sentiment, q(search), limit, offset`.

Returns:
```
{ conversations: [ …page of conversation rows (id, contact, last_message, last_message_at,
    status, channel, unread_count, assigned_agent_id, labels, temperature?, source_campaign_id) ],
  total,                       // exact count of all matches (uncapped)
  summary: { total, new_today, new_week, new_month, hot, warm, cold, unanswered, unread } }
```
- **Uncapped**: `total` + every summary number via `count:'exact', head:true` (or an aggregate
  RPC) with the same filters — never a capped `.select().length`.
- **Filters that need a join/subquery**: temperature/stage → `conversation_id IN (SELECT
  conversation_id FROM leads WHERE workspace_id=… AND temperature=…)`; campaign →
  `source_campaign_id = …`; unanswered → conversations whose latest message is inbound
  (a `DISTINCT ON (conversation_id) … ORDER BY created_at DESC` subquery, or reuse the
  `get_unanswered_conversations` pattern), scoped to the filtered set. Where a set of filters is
  too complex for the query builder, back it with a `SECURITY DEFINER` search/summary RPC
  (migration 069), workspace-scoped + `REVOKE`d.
- **Date range** via `resolveRange` (IST, exclusive upper). Pagination via `limit`/`offset`
  (default 30). Stable order (`last_message_at DESC, id`).

## UI — Conversations page

Extend `modules/conversations/components/ConversationList` (+ a new `ConversationFilters` and
`ConversationSummaryBar`) and its hook `useConversations`:
- **Filter bar**: a date-range control (`QUICK_RANGES` + custom), and dropdowns/toggles for
  channel, status, campaign (list the workspace's campaigns), lead temperature, flags
  (unread/unanswered/replied/spam), assigned agent, labels, sentiment, + a server-side search box.
  Active filters shown as removable chips; a "Clear all".
- **Summary strip** (top): New today / this week / this month, Hot / Warm / Cold, Unanswered,
  Unread — each a small stat, reflecting the current filters.
- The list fetches `/api/conversations/search` (react-query keyed on the filter object), paginated
  (infinite scroll or "load more"). Selecting a conversation still opens `ChatWindow` unchanged.
- Loading/empty ("No conversations match these filters")/error states. Responsive.

## Reporting (answers the master prompt's questions)

The summary bar + filters directly answer: new today/week/month (date-scoped counts), "from
campaign X" (campaign filter), how many hot/warm/cold (temperature counts), how many unanswered
(unanswered flag/count) — all without manual scrolling, all filter-aware.

## Security / performance

Every query/RPC workspace-scoped; API permission-gated; new RPCs `SECURITY DEFINER` + `REVOKE`d.
No metric via a capped `.select()`. Indexes: `(workspace_id, source_campaign_id)`,
`leads(conversation_id)`, and rely on existing `idx_conversations_fts` + status/created_at
indexes. Server-side pagination keeps payloads small.

## Testing

- **Unit**: filter→query mapping (pure builder if extracted); the "new today/week/month" boundary
  math (reuse `resolveRange`); unanswered definition.
- **Live (controller)**: against a real workspace (Razorveda/Umang) — filtered `total` equals a
  direct DB count for the same filters (uncapped, >1000 where applicable); campaign filter returns
  only that campaign's conversations (post-backfill); temperature filter matches the leads join;
  summary counts match direct counts.
- **Security**: cross-tenant search (workspace A as member of B) → 403; RPCs not client-callable.

## Rollout

Migration 069 (source_campaign_id + backfill + index) applied live; the campaign-link stamping +
API + UI require redeploy. Additive — the current status/channel tabs keep working (now
server-side). No existing conversation data changed except the new denormalized column.

## Out of scope

UX visual polish (Project 4). Cross-channel unified search beyond WhatsApp+Instagram. Saved-filter
presets (could be a fast-follow). Bulk actions on filtered sets.

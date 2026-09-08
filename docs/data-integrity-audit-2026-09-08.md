# AGENTiX Data-Integrity & Tenant-Isolation Audit — 2026-09-08

Whole-codebase audit (app/api, modules, lib) for: data-accuracy bugs, cross-tenant/IDOR leaks, unauthenticated endpoints, artificial caps that undercount, and fabricated/demo data. `createAdminClient()` uses the service role and **bypasses RLS**, so every finding below is a real gap, not caught by row-level security.

**Good news first:** the sweep found **zero fabricated/demo/random data** presented as real business metrics anywhere — dashboards, charts, invoices, and lists all read from real queries. The problems are (a) security/tenant-isolation gaps and (b) specific calculation/cap bugs.

Legend: ✅ = verified against live DB / by reading the file; 🔎 = agent-reported with code citation, not yet independently reproduced.

---

## TIER 1 — CRITICAL SECURITY: unauthenticated / weak-auth debug endpoints (delete now)

These are `// DELETE THIS FILE after use` leftovers live in production.

1. ✅ **`app/api/admin/workspace-token/route.ts`** — returns `access_token`, `phone_number_id`, `waba_id` for any workspace by name, gated ONLY by `?secret=CRON_SECRET` (the cron secret is embedded in cron URLs, not a tightly-held admin credential). **Leaks live WhatsApp send credentials cross-tenant.**
2. ✅ **`app/api/admin/export-untracked-contacts/route.ts`** — **NO auth at all**; returns a CSV of contact `phone,name,status` PII for a hardcoded campaign.
3. ✅ **`app/api/admin/backfill-campaign-recipients/route.ts`** — **NO auth at all**; a `GET` that performs bulk `insert`/`update` writes; anyone can trigger repeatedly.
4. 🔎 **`app/api/admin/campaign-errors/route.ts`** (MED) — cross-tenant campaign error data, gated only by `?secret=CRON_SECRET`.

**Fix:** delete all four (they were one-time tools). Trivial, zero risk.

---

## TIER 2 — CROSS-TENANT IDOR (authenticated user can act on another tenant)

Pattern: permission is checked against the caller's OWN workspace, but the resource id (from body/query) is never cross-validated against it.

5. 🔎 **`app/api/wa-forms/[id]/send/route.ts:33-37`** (HIGH) — `requireWorkspacePermission(form.workspace_id, …)` then fetches `conversationId` (from body) with no workspace check → **sends a WhatsApp message to another tenant's contact using the caller's credentials, and leaks that contact's phone number.**
6. 🔎 **`app/api/campaigns/[id]/daily-stats/route.ts:21-31`** (HIGH) — permission checked on `?workspaceId=`, data read by `campaignId` with no cross-check → read any tenant's campaign recipient timestamps.
7. 🔎 **`app/api/campaigns/[id]/queue-status/route.ts:11-23`** (HIGH) — same shape → poll any tenant's campaign queue progress/errors.
8. 🔎 **`app/(widget)/widget/[workspaceId]/page.tsx:10-16`** (HIGH) — public page trusts the raw `[workspaceId]` URL segment and returns `name, phone_number_id, brand_color, logo_url` for ANY workspace, with no widget-enabled/`is_active` check (unlike the correct `/api/widget/[key]` routes).
9. 🔎 **`app/api/webhooks/abandoned-cart/route.ts:37-46`** (HIGH) — public endpoint trusts a payload `workspace_id`; the signature check only runs `if (configuredSecret)` — a trigger with no secret can be fired by anyone, sending WhatsApp from that tenant's number.
10. 🔎 **`app/api/integrations/shopify/route.ts`** (auth gap) — HMAC verification skipped entirely when `shopify_webhook_secret` is unset → forged payloads upsert contacts/orders + trigger sends.
11. 🔎 **`app/api/campaigns/test-send/route.ts:94-98`** (MED) — template read by `id` only → leaks another tenant's template body/name.
12. 🔎 **`app/api/webhooks/whatsapp/route.ts:2440-2505` (`handleStatusUpdate`)** (MED) — status update `UPDATE … WHERE whatsapp_msg_id = …` with no workspace scoping; only safe because Meta ids don't collide by chance.

**Fix:** in each, fetch the resource's real `workspace_id` and assert it equals the authorized workspace (or filter the query by both id AND workspace_id); require auth + mandatory signature on the public webhooks.

---

## TIER 3 — DATA ACCURACY (the reported concern)

13. ✅ **`modules/analytics/services/analytics.service.ts:64-78` (`fetchMessageFunnel`)** (HIGH) — `delivered`/`read` counts omit `direction='outbound'`; inbound messages are stored `status='delivered'/'read'`, so **delivered can exceed sent**. Verified on the busiest workspace: delivered shows **9,376** vs sent **8,377** (correct delivered = 3,260). A >100% funnel.
14. 🔎 **`app/api/analytics/extended/route.ts:32-76`** (HIGH) — `campaignSummary` totals (total/completed/running/failed/totalSent) are reduced over only the **10 most-recent** campaigns (`.limit(10)` meant for the display table). Any workspace with >10 campaigns shows wrong totals, diverging from the dashboard's uncapped figures.
15. 🔎 **`app/api/analytics/detail/route.ts:98-117`** (HIGH) — CSAT `avg`/distribution computed over only the **200 most-recent** responses (`.limit(200)`); diverges from `analytics/overview`'s uncapped CSAT average.
16. 🔎 **`app/api/reports/export/route.ts:51-52` (+122,224,282)** (HIGH) — date range uses naive `${from}T00:00:00.000Z` (UTC) instead of IST-aware `resolveRange`; rows created 00:00–05:30 IST land in the wrong day vs the dashboard/Conversations. (This exact anti-pattern is documented as already-fixed in `analytics/overview`.)
17. 🔎 **`app/api/reports/export/route.ts:41-110`** (HIGH) — exports apply **none** of the on-screen filters (status/channel/agent/label/sentiment/stage) and **never exclude spam** → a "conversations" report is a coarser, larger set than the Conversations screen shows.
18. 🔎 **`app/api/conversations/export/route.ts:194-202` & `reports/export` messages** (HIGH) — history/message exports miss `.eq('is_deleted', false)` → soft-deleted messages (invisible on screen) appear in downloads.
19. ✅ **`lib/usage-tracker.ts:47-59`** (HIGH) — `.single()` error never checked; a transient read error makes `currentValue` fall back to 0 and **overwrites the stored monthly usage count to 1** (e.g. 500→1) — corrupts data AND lets plan limits be bypassed afterward.
20. 🔎 **Three incompatible "avg first response time" definitions** (MED) — dashboard RPC (all rows), `analytics/overview` (JS, silently drops <0 or >7d outliers), `analytics/agents` (per-agent, different timestamp basis + unordered `.limit(100)`). Same UI label, three different numbers.
21. 🔎 **`modules/conversations/components/ConversationList/index.tsx:75-106`** (MED) — the Export dialog defaults `from`/`to` to **today** and always sends them, while the Conversations screen defaults to **all-time** → a plain "Export" click downloads only today's rows.
22. 🔎 **`app/api/conversations/export/route.ts`** (MED) — (a) row order diverges from screen for null `last_message_at` (missing `nullsFirst:false`); (b) `status=all`/`channel=all` not normalized server-side (only the UI caller strips it); (c) single-conversation export ignores the new campaign-scoped thread filter.
23. 🔎 **`app/api/admin/meta-billing/route.ts:106-114 & 210-219`** (MED) — fallback `campaigns.sent_count` sum is unbounded (implicit 1000-row cap) and feeds `total_inr` on a **client invoice** → undercounts for >1000-campaign months.
24. ✅ **`app/api/analytics/agents/route.ts:137-143`** (MED, latent) — per-agent CSAT query filters by `agent_id` only, no `workspace_id`. Currently 0 agents span multiple workspaces (verified), so not leaking today — but wrong the moment one does.
25. 🔎 **`app/api/analytics/extended/route.ts:206-212`** (MED) — `flow_sessions` capped at unordered `.limit(5000)` → undercounts per-flow completion for high-volume workspaces.
26. 🔎 **`lib/plan-guard.ts` / `lib/usage-tracker.ts getUsage`** (MED) — on DB error, silently default to `'free'` plan / all-zero usage with a 200 response (no error surfaced) → paying customer can be wrongly limited, or shown "0% used".

---

## TIER 4 — DEFENSE-IN-DEPTH (not currently exploitable; harden)

The "id was resolved from an earlier workspace-scoped query, but the dependent write/read doesn't re-assert `workspace_id`" pattern. Safe under the current single caller, but no in-function guard:
- `lib/flow-engine.ts` (flow_sessions / messages / conversations by id only)
- `lib/inbox-rules-engine.ts` (conversations/contacts by id only)
- `app/api/tasks/[id]/route.ts` (update/delete by id)
- `app/api/workspace/retention/route.ts` (bulk message/conversation **deletes** by conversation batch — high blast radius if a slip occurs)
- `app/api/meta-prefill/backfill/route.ts`, `app/api/payments/create-link`, `app/api/team/balance`, `app/api/chat-widgets/[id]`, `app/api/knowledge-base/flagged-replies/[id]`, `app/api/cron/{run-scheduled-campaigns,time-triggers}`, `app/api/webhooks/meta` (full-table workspace read)
- `lib/campaign-executor.ts executeCampaign` (runs any campaignId given; caller authorizes)

**Fix:** add `.eq('workspace_id', workspaceId)` to the dependent queries / pass and assert the id.

---

---

## Second wave (full 11-agent sweep) — additional confirmed findings

More cross-tenant IDOR (Tier 2):
- 🔎 **`app/api/conversations/[id]/smart-assign/route.ts:57-91`** (HIGH) — `workspaceId` from body is permission-checked, `conversationId` never validated against it → read + **reassign** another tenant's conversation into your workspace.
- 🔎 **`app/api/ai/translate/route.ts:59-87`** (HIGH) — **no `requireWorkspacePermission` at all**; any authenticated user writes `contacts.language` for a conversation in any workspace.
- 🔎 ~20 MED "defense-in-depth" writes (conversations/leads/contacts/tasks/messages `[id]` update/delete filtered by `id` only, workspace resolved from an earlier scoped fetch) — not exploitable as written, fragile on refactor. Highest blast radius: `workspace/retention` bulk deletes.

The dominant DATA-ACCURACY root cause — **PostgREST's implicit 1000-row cap treated as the full set** (`.select().length`/`.reduce()` used as a total, or an unbounded select feeding an aggregate). Confirmed instances:
- ✅ `analytics.service.ts` funnel (delivered 9,376 > sent 8,377).
- 🔎 `analytics/extended` campaignSummary (10-cap), `admin/analytics/client/[id]` KPIs (20-cap), `analytics/detail` CSAT (200-cap) + delivery buckets (unbounded), `analytics/overview` CSAT (unbounded), `analytics/agents` avgFirstResponse (100-cap).
- 🔎 `campaigns/[id]/daily-stats` (unbounded → truncated chart) + `campaigns/[id]/ab-comparison` (winner wrong >1000) + `campaigns/list` (unbounded).
- 🔎 `contacts/[id]/360` totalOrders/**totalSpent** (10-cap) + totalConversations (20-cap); `modules/crm/services/lead.service.ts` Kanban (unbounded); `dashboard-stats/my-work` (unbounded); `team/workload` (unbounded); `ai/revenue/insights` (unbounded); `vector-kb` (unbounded); `admin/meta-billing` invoice fallback (unbounded → wrong bill).
- 🔎 `app/api/cron/automation-triggers/route.ts:66-71` (HIGH) — birthday cron reads contacts unbounded → **contacts past row 1000 never get a birthday message, every day.**

Silent error→zero/empty (feeds fabricated-looking data):
- ✅ `lib/usage-tracker.ts:47-59` (HIGH) — transient read error resets stored usage to 1 (bypasses plan limits).
- 🔎 `app/api/contacts/bulk/route.ts` (HIGH) — unchecked error mid-export → silently truncated CSV returned as complete.
- 🔎 `app/api/meta-leads/route.ts:77-95` (HIGH) — KPI query errors render as `0` leads.
- 🔎 `contacts/[id]/360`, `leads/[id]/score`, `leads/[id]/conversion` undo, `lib/plan-guard.ts` (→'free') — errors silently become empty/zero/most-restrictive.

Campaign counter integrity:
- 🔎 **`lib/campaign-executor.ts:610-614,936-939`** (HIGH) — on **Resume/retry**, `total_recipients` & `filtered_count` are overwritten with only the remaining-audience count (not merged) and have **no recompute path** anywhere → permanent undercount; combined with the self-healing `delivered_count` this makes `delivered/total` **exceed 100%** in list/extended views.
- 🔎 `campaigns/list/route.ts:34` (MED) — `live_replied` hardcoded `0` (ignores `c.replied_count`).

Reports vs Conversations (Tier 3, from agent B) — IST date slicing, missing filters + spam, deleted-messages, export-defaults-to-today, row order, campaign-scope: as listed in Tier 3 above.

**Not a finding:** zero fabricated/mock/random data as real metrics (swept and confirmed clean).

---

## Suggested fix order
1. **Tier 1** — delete the 4 debug endpoints (minutes, critical, zero risk).
2. **Tier 2 HIGH IDOR** — smart-assign, ai/translate, wa-forms/send, daily-stats, queue-status, widget page, abandoned-cart, shopify: add resource↔workspace ownership assertions + mandatory webhook signatures.
3. **Tier 3 HIGH data** — the 1000-row-cap pattern (shared fix: `count:'exact'`/`paginateAll` instead of `.select().length`), funnel direction filter, reports/export alignment (IST + filters + is_deleted), usage-counter error check, campaign-executor total_recipients recompute, birthday-cron pagination.
4. **Tier 3 MED + Tier 4** — remaining consistency (response-time unification, export defaults, live_replied) + defense-in-depth re-scoping.

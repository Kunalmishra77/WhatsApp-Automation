# Phase 1 — Unified Lead & Source Foundation (Spec)

> **Scope:** internal only — NO Google APIs, NO external approvals needed. Fully buildable today.
> **Principle:** additive & non-breaking. New nullable columns + one new table + one new page. Existing CRM/leads/conversations logic is untouched.
> **Goal:** every lead, from every channel, carries a normalized **source attribution**, and the business can see **all leads in one place** with a **source breakdown** and a **per-contact journey timeline** — the base that GBP, Google Ads, and every future channel plug into.

## 1. Data model (additive)

### 1.1 New nullable columns (no change to existing columns' meaning)
On **`leads`** and **`contacts`**:
- `channel` text — normalized source channel: `whatsapp | instagram | meta_ads | google_ads | gbp | website | chat_widget | campaign | api | referral | manual | other`.
- `source_detail` text — human/ref detail (e.g. campaign name, ad id, GBP location, form name).
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` text — for web/ad sources.
- `first_touch_channel` text, `first_touch_at` timestamptz — first known touchpoint.
- `last_touch_channel` text, `last_touch_at` timestamptz — most recent touchpoint.

### 1.2 New table `marketing_touchpoints` (the journey timeline)
`id uuid pk`, `workspace_id uuid`, `contact_id uuid`, `lead_id uuid null`, `channel text`, `source_detail text`, `ref_type text` (conversation | campaign | meta_lead | google_lead | gbp_review | form | manual), `ref_id text null`, `occurred_at timestamptz`, `metadata jsonb`, `created_at timestamptz`. Indexes on `(workspace_id, contact_id, occurred_at)`; **RLS** workspace-scoped (matches post-audit standard).

### 1.3 One-time backfill (derive channel for existing data)
Populate `leads.channel`/`source_detail` from existing signals, in priority order:
- conversation has `source_campaign_id` → `campaign` (+ campaign name).
- contact/conversation carries the `Meta Ad Lead` label → `meta_ads`.
- came from chat widget → `website`.
- Instagram channel conversation → `instagram`.
- else → `whatsapp` (default for inbound) / `manual` (agent-created).
Also seed `first_touch_*`/`last_touch_*` from the earliest/latest known event.

## 2. Backend (all additive)
- **`lib/lead-attribution.ts`** — pure helpers: `normalizeChannel(raw)`, `resolveSource({...})`, and `recordTouchpoint(db, {...})` that (a) inserts a `marketing_touchpoints` row and (b) updates the lead/contact `last_touch_*` (and `first_touch_*` if empty). One shared writer so every channel attributes identically (the DRY lesson from the campaign-attribution fix).
- **Hook points** (additive calls, wrapped fail-open so they never break the existing flow): inbound WhatsApp/Instagram webhook (lead/contact create), Meta Lead Ads ingestion, campaign reply → lead, chat-widget submission, manual lead create. Each calls `recordTouchpoint` with its channel.
- **APIs:**
  - `GET /api/leads/unified?workspaceId=&channel=&from=&to=&…` — paginated leads with channel/source columns + filters (reuses lead auth + workspace scoping).
  - `GET /api/analytics/lead-sources?workspaceId=&from=&to=` — counts + conversion by channel (exact, paginated — per the data-integrity standard).
  - `GET /api/contacts/[id]/journey?workspaceId=` — the touchpoint timeline for Contact 360.

## 3. Frontend (additive)
- **New sidebar item "Unified Leads"** (under CRM/Growth) — a table of ALL leads with **Channel**, **Source**, **Stage**, **Temperature**, **Created**, filters by channel/date/stage, and a **source-breakdown chart** (leads + conversion % per channel) at the top.
- **Contact 360** — add a "Journey" section (touchpoint timeline).
- **Lead detail** — show channel + source + UTM.
- Existing Leads/CRM Pipeline pages unchanged (Unified Leads is a new, additional view).

## 4. Multi-tenant / security
- Every new column/table/query workspace-scoped; RLS on `marketing_touchpoints`; APIs use `requireWorkspacePermission`. No cross-tenant surface (post-audit defense-in-depth pattern applied from the start).

## 5. Non-breaking guarantees
- New columns are nullable → existing queries/inserts unaffected.
- Touchpoint writes are fail-open (a failure logs and continues; never blocks lead/conversation creation).
- New page + APIs are additive; no existing route/table behavior changes.

## 6. Build order (tasks)
1. **Migration 087** — new columns on leads/contacts + `marketing_touchpoints` + indexes + RLS. *(this step first)*
2. Backfill script (existing leads/contacts → channel/source/first-last touch).
3. `lib/lead-attribution.ts` + unit tests.
4. Wire `recordTouchpoint` into the create points (webhook, meta-leads, campaign, chat widget, manual).
5. APIs: `/api/leads/unified`, `/api/analytics/lead-sources`, `/api/contacts/[id]/journey`.
6. Frontend: Unified Leads page + source chart; Contact-360 Journey; lead detail source fields.
7. Verify (tsc, tests, live spot-check), push, redeploy.

## 7. What this unlocks
Once every lead is normalized to a `channel` + touchpoints, **Google Business Profile leads, Google Ads leads, Meta Lead Ads, website forms, and campaigns all drop into the same hub** (Phases 2–5) with zero rework — this is the spine of the "one place for all marketing/leads" vision.

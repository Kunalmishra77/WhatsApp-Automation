# Project 4 — UX Polish + Competitive Audit & Roadmap

**Date:** 2026-08-14
**Method:** Four parallel read-only audits (dashboard interactivity, conversations surface, cross-app sweep, market/competitor) + live DB verification.
**Status:** Findings consolidated; build waves pending user prioritization.

> Project 4 is the last of the 5-project overhaul. The user's ask ("check it all, do best") reframed it from cosmetic polish into an **audit-driven** program: find every gap/dead-end/broken thing across the app, benchmark against competitors, then fix in prioritized waves.

---

## 0. NOT polish — Security & correctness (fix first, independent of UX waves)

| # | Finding | Severity | File |
|---|---|---|---|
| S1 | **Unauthenticated cron trigger.** `GET /api/cron/sync-campaign-replies?admin=1` skips the `CRON_SECRET` check → anyone can trigger a heavy cross-tenant sync (admin client, all workspaces). Also the UI button sends a dead `Bearer ${NEXT_PUBLIC_CRON_SECRET}` header (that env var doesn't exist). | **High** | `app/api/cron/sync-campaign-replies/route.ts:13-15`; `modules/campaigns/components/CampaignDetail/index.tsx:654` |
| S2 | **"Download CSV (N selected)" exports everyone.** Contacts bulk export ignores the selected ids and downloads all contacts matching the current search — a user handing off "these 5 VIPs" gets hundreds of unrelated rows, silently. | **High** (data-correctness) | `modules/contacts/components/ContactsTable/index.tsx:116-123`; `app/api/contacts/bulk/route.ts` |
| S3 | **Auto-pay toggle is non-functional.** On the billing screen the Switch is disabled when on and no-ops when off (snaps back); the real enable path is a separate button. A dead control on the one screen where trust matters most. | **High** (trust) | `modules/settings/components/BillingSettings/index.tsx:229-240` |
| S4 | **Dead-end CTA.** Campaigns "Broadcast" / "Retry Campaign" push `/campaigns?broadcast_to=<phones>` but nothing in the app reads `broadcast_to` — the phone list is silently dropped, user lands on the plain list. | **High** | `modules/campaigns/components/CampaignDetail/index.tsx:824-827, 861-864` |

---

## 1. The "All conversations empty" report — RESOLVED, not a bug

Live DB check: every real client workspace has conversations (Umang **1,729**, Razorveda **1,006**, Fitness First **623**, VMS **572**, Skinwise **118**, …; 4,112 total across 15 workspaces). The owner's logins are members only of their **own** workspaces — `myai@ai-agentix.com` → "Agentix" (**0** convos), `aiagentix2025@gmail.com` → "AGENTiX" (**1**). Viewing an empty own-workspace correctly shows "No conversations found." Multi-tenant isolation working as designed.

**Real gap it exposes:** `requireWorkspacePermission` (authz.ts:48) has **no global super-admin bypass**, so the platform owner cannot view/oversee any client's inbox from inside the app (billing views use the admin client; conversations don't). → **Owner oversight view** is a legitimate Project-4 item. *(Minor: two workspaces are both named "Agentix" — dedupe.)*

---

## 2. Dashboard (CommandCenter) — 20 clickability gaps

Admin/owner/manager get `CommandCenter`, which has **zero interactive elements** beyond the two Refresh buttons (`KpiCard`/`SectionCard` don't even accept `onClick`). (Agents get `MyWorkDashboard`, whose tiles already navigate.)

- Every KPI / stat tile / chart bar / section header should drill through. Highest-value: **Conversations status tiles** (Total/Open/Resolved/Unresolved → `/conversations?status=…`, API param already exists), **Leads temperature tiles** (→ `/crm?temperature=…`), **Campaign tiles + top-campaigns bars** (→ `/campaigns?status=…` and `/campaigns/[id]`).
- **Blocker for most drill-throughs:** destination pages (`ConversationList`, `KanbanBoard`, `CampaignList`) hold filter state in local `useState` and don't read `useSearchParams()` — so a `router.push('/conversations?status=open')` lands on an *unfiltered* list. **URL-driven filters are a prerequisite.**
- **API tweak needed:** `/api/dashboard/overview` `campaigns.top` selects `name, sent_count, replied_count` only — no `id`, so the top-campaigns bars have no link target until `id` is added.

---

## 3. Conversations surface

- **Summary tiles: 8/8 inert.** New today/week/month, Unread, Hot/Warm/Cold, Unanswered are plain `<div>`s — should filter the list (`quick=today/this_week/this_month`, `flag=unread/unanswered`, `temperature=hot/warm/cold`), with toggle + selected state.
- **Filter bar is complete** — all 11 API filters have a UI control. (No gap here.)
- **Export (`view=summary`) missing 7 columns:** **Sentiment** (user-requested), **Temperature**, Stage, Source Campaign, First Replied At, Unread Count, Is Spam — all available in the data model.
- **Export is filter-narrow:** the export route only accepts status/channel/date, not the 7 richer filters — so "export exactly what I'm filtered to" isn't possible.
- Other: no mobile/responsive layout (fixed 3-pane), "Download Excel" label vs server-chosen format, two inconsistent export entry points.

---

## 4. Cross-app (analytics / campaigns / CRM / contacts / settings)

- **Analytics:** table rows (campaign/team/flow/top-contacts) aren't clickable though KPI cards are — inconsistent drill-through; add `leads`/`campaigns` drawer types; export menu omits campaigns + leads.
- **CRM:** Lead Detail contact block isn't clickable (can't open profile / start conversation); lead export missing **AI Score** column and exposes only 1 of 5 server filters; no total-pipeline-value rollup.
- **Contacts:** tag/blocked filters exist server-side but have no UI control; export is CSV-only, fixed 6 columns.
- **Settings/Billing:** invoice rows have no download (GST need); Billing & API-Keys share the same nav icon.

---

## 5. Component duplication (design-system debt)

**Six** independent stat-card re-implementations: `KpiCard` (shared) + `KpiCard` (analytics, re-impl) + `KpiCard` (admin, **hardcoded light-mode colors → dark-mode contrast bug, High**) + `MetricCard` (my-work) + `StatCard` (ai-revenue) + `StatTile` (admin) + `MiniStat` (campaign detail). → Promote one `<StatCard>` to `components/ui/` (label, value, icon, color, sub, trend, loading, onClick) and migrate all call sites.

---

## 6. Competitive analysis (India WhatsApp/IG automation)

**Feature gaps to close (many competitors have, we appear to lack):**
1. **WhatsApp Catalog / in-chat commerce** (AiSensy, Interakt, Zoko, DoubleTick, BusinessOnBot).
2. **Click-to-WhatsApp Ads manager / attribution** (AiSensy, Wati, Zoko, BusinessOnBot) — fastest-growing Meta ad format in India.
3. **WhatsApp Flows** (native in-chat forms) — Gallabox has it; low-effort Meta primitive.
4. **Customer-facing in-chat payments** (UPI/Razorpay for tenants' *own* customers) — AiSensy has it; completes the commerce loop.
5. **AI agent-assist/copilot** for human agents (suggested replies, thread summaries) — Wati, Verloop, Yellow.ai.

**Our differentiators to lean into:** bundled **live AI agent** (most gate AI behind upsells/beta); **Kanban CRM with hot/warm/cold temperature** (no researched competitor has an equivalent visual model); **transparent flat INR pricing** incl. GST (counters the repeatedly-cited "real bill 30-50% above sticker" pain). *(Caveat: IG+WA unified is a moderate, not total, edge — Wati/Interakt/Gallabox/Verloop also do IG; Zoko charges extra; AiSensy/DoubleTick/BusinessOnBot/Combirds don't. Message it as "flat-priced & bundled, half the market charges extra or lacks it.")*

---

## 7. Proposed build waves (for user sign-off)

- **Wave 0 — Security & correctness batch** (S1–S4 above). Small, high-trust, not polish. *Recommend doing immediately.*
- **Wave 4a — Design-system foundation.** Shared `<StatCard>` (fixes dark-mode bug) + URL-driven filters on ConversationList/KanbanBoard/CampaignList (unblocks all drill-through). Everything else renders on this.
- **Wave 4b — Make it clickable.** Dashboard 20 elements + conversations 8 tiles + analytics tables + CRM lead→contact. (Directly answers the user's "kuch clickable nahi hai" complaints.) Needs the `campaigns.top` `id` API tweak.
- **Wave 4c — Export completeness.** Conversations +7 columns (incl. Sentiment) + rich filters; lead export +AI Score + filters; analytics campaigns/leads export; contacts tag/blocked filters + selected-only export.
- **Wave 4d — Owner oversight.** Super-admin cross-workspace conversation/inbox view; dedupe "Agentix" workspaces.
- **Wave 4e — Competitive features (net-new, larger).** Catalog/commerce, CTWA ads attribution, WhatsApp Flows, customer-facing in-chat payments, AI agent-assist. Plus positioning (public pricing page, sharpen temperature/IG messaging).
- **Wave 4f — Responsive & cosmetic.** Conversations mobile 3-pane, billing invoice download, settings icon/label consistency, misc P3s.

**Recommended order:** Wave 0 → 4a → 4b → 4c → 4d → (4e as its own mini-overhaul) → 4f.

Each wave = its own spec → plan → implement → review → merge, per the established workflow.

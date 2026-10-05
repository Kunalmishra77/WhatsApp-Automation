# Lead Classification & Platform Analysis — 2026-10-05

> Structured analysis requested before major changes. Grounded in the current codebase.
> Priority objective: **accurate, business-aware, explainable, configurable lead classification** across all client portals.

---

## 1. Current lead-classification problems (root cause)

There are **three disconnected classification systems** that don't agree with each other:

| System | Field | How it's set | Problem |
|---|---|---|---|
| **Temperature** | `leads.temperature` (hot/warm/cold) | `detectLeadTemperature()` — **single-message keyword match**, escalate-only (webhook `createOrUpdateLead`, line ~1397) | **THE BUG.** One message with "price/interested/want/chahiye/kitna" → instantly **Hot**. Never downgrades. No context, no engagement, no confidence. |
| **Pipeline stage** | `leads.stage` (new→contacted→interested→converted→lost) | `classifyLeadPipeline()` — AI (gpt-4o-mini, temp 0), confidence-gated (≥70), with reasons + `lead_stage_history` | Good design, but runs **independently** of temperature → a lead is `Hot` + `stage:new` at the same time. |
| **AI lead score** | `contact_insights.lead_score` (0-100) | `/api/ai/revenue/analyze` — AI + keyword fallback | A **third** opinion, powering the "AI Lead Intelligence" page, disconnected from the other two. |

**Why the user sees wrong/contradictory classifications:**
- `detectLeadTemperature` is purely lexical: `HOT_KEYWORDS.some(k => text.includes(k))`. "kitna hai?" (1 msg) → Hot. This is the exact "1 message = Hot" case.
- Temperature is **escalate-only** — once Hot, always Hot, even if the lead goes cold or stops replying.
- Three systems × no single source of truth → the same lead can read Hot (temperature), `new` (stage), and low-score (insights) simultaneously.
- No confidence gate on temperature; no explainability on temperature; no business-specific rules anywhere; converted leads still counted in Hot/Warm/Cold.

---

## 2. Recommended architecture — one unified, score-driven engine

Collapse the three systems into **one Lead Scoring engine** that is the single source of truth.

```
Inbound message / periodic re-eval
        │
        ▼
  Lead Scoring Engine  ──(AI, business-aware, same call as pipeline classifier)
        │   produces: score 0-100 + confidence + signals[] + reason + stage + conversion?
        ▼
  leads.lead_score (0-100)  ─────► temperature DERIVED from per-client thresholds
  leads.score_confidence                (e.g. 0-30 Cold · 31-60 Warm · 61-100 Hot)
  leads.score_signals (jsonb)   ─────► explainability (why)
  leads.stage                    ─────► pipeline (unchanged, already good)
  leads.score_history            ─────► audit trail (Cold→Warm→Hot→Converted + reason + ts)
        │
  Converted = SEPARATE terminal state, set ONLY on a real conversion event
             (payment/order/booking confirmed, or manual, or connected-system), NEVER by score.
```

**Key principles:**
- **Score is the truth; temperature is derived** from it via per-client thresholds. No more independent keyword temperature.
- **Business-aware:** scoring reads a per-workspace rule config (weights, signals, keywords, thresholds), not one global rule.
- **Confidence-gated:** low confidence → keep existing classification or mark "for review", never an aggressive jump.
- **Deterministic enough:** AI at `temperature: 0` + explicit rubric → same input ≈ same output. Score changes are logged.
- **Converted is an event, not a range.**

---

## 3. Hot / Warm / Cold / Converted — recommended rules

**Signals that raise score** (weighted; weights configurable per client):
- Explicit buying intent ("I want to buy / order / book") — **high**
- Pricing / quotation request — **high**
- Demo / appointment / availability request — **high**
- Payment / order-detail discussion — **very high**
- Shares a concrete requirement (size, qty, date, budget) — **high**
- Negotiation — **high**
- Responds to a follow-up / sustained back-and-forth (≥N meaningful turns) — **medium**
- Positive sentiment + specific product questions — **medium**

**Signals that lower score:**
- Single generic/informational message, no intent — **stays low (≤30)**
- "later / maybe / not now / baad mein" — **lower**
- Stopped responding after initial contact — **decay over time**
- Off-topic / spam (now flagged by smart-moderation) — **excluded entirely**

**Derived bands (defaults, per-client configurable):** 0-30 Cold · 31-60 Warm · 61-100 Hot.

**Converted** (terminal, separate): only on a genuine event — in-chat purchase/payment/booking confirmation (AI `converted:true` with quoted line, already implemented), **or** agent manually marks converted, **or** a connected system (Shopify/CRM) confirms. The business picks which events count.

---

## 4. Business-specific configuration (per client portal)

New **Settings → Lead Classification** area storing `workspaces.settings.lead_rules`:
- Band thresholds (Cold/Warm/Hot cutoffs).
- Signal weights (which signals matter more for THIS business).
- Custom buying-signal keywords/intents (industry-specific).
- Which events = Converted.
- Score-decay policy (how fast a quiet lead cools).

Pre-seeded from the industry vertical pack (`lib/verticals.ts`) so clients start with sensible defaults, not a blank form.

---

## 5. AI-generated rule suggestions

On setup (or on demand), an endpoint analyzes the workspace's business description + recent conversations and **proposes** a `lead_rules` config:
> "Based on your business (skincare) and past chats, we recommend: pricing request → +30, 'photo bhejo'/skin-concern shared → +20, single 'hi' → +5…"

Shown as **recommendations the client can Accept / Edit / Reject** — never applied silently. Clearly labeled "AI suggestion".

---

## 6. Confidence & explainability

- Every lead stores `lead_score`, `score_confidence`, `score_signals` (the weighted reasons), and a human `reason`.
- **Lead detail UI** shows: `Hot — 82/100` + bulleted reasons (pricing asked, availability asked, replied to follow-up).
- **`lead_score_history`** table: every change with from→to, score, reason, confidence, timestamp → the Cold→Warm→Hot→Converted audit trail.
- Low confidence → UI badge "low-confidence / needs review"; engine does not move an established classification on a weak signal.

---

## 7. Conversation → Google Sheets sync

**Recommended: one row per LEAD, continuously updated** (not one row per message). Reasons: searchable/reportable, no runaway row growth, matches CRM mental model. (Per-message logging already exists separately via the Apps Script "All Conversations" tab for raw history.)

Columns: Lead ID, Name, Phone, Source, Client, First-contact date, Last message, **Lead score, Temperature, Classification reason**, Stage, Assigned agent, Conversion status, Last updated.

Mechanism: a per-workspace connected Sheet (Settings → Integrations). On lead create/score-change, upsert that lead's row by Lead ID (Apps Script webhook `upsertLead`, or Google Sheets API). Note: the codebase already has `sheets-notify` + `sheets_webhook_url` plumbing to build on.

---

## 8. Platform audit — status (high-level; deep-dive available per area)

From prior full audits this cycle (see memory): multi-tenant RLS isolation is enforced (`is_workspace_member`), auth + admin portal solid, 1000-row undercounts fixed, webhook signatures verified, IDOR/debug endpoints closed (`docs/data-integrity-audit-2026-09-08.md`). Dashboard/analytics self-populate. **The one systemic correctness gap is lead classification (this doc).** Duplicate-lead handling: leads are keyed per contact (escalate-only) — needs review under the new engine. Recommend: after the classification rebuild, a focused pass on duplicate leads + converted-excluded-from-active-counts.

---

## 9. Market/competitor features

**(Being researched by a background agent — findings appended on completion.)** Preliminary direction for an Indian SMB WhatsApp-AI CRM: AI lead scoring with explainability (this doc), auto lead-routing, in-chat payments, broadcast analytics, multi-channel (Telegram/SMS), AI agent handoff, and sentiment trends.

---

## 10. GMB / Google Business Profile — current status

**Implemented:** OAuth connection (`gbp_connections`), location/review/Q&A/insights sync (`lib/gbp-sync.ts`, migration 089), AI review auto-reply (opt-in), review-request automation, Free GBP Report lead-magnet (Places API), Local Rank tracker (Places text search).
**Pending (setup, not code):** Google OAuth **app verification** — the consent screen + verified domains in Search Console (per `grexa-gbp-google-ads-initiative` memory) so non-test users can connect. Scopes: `business.manage`. Needs: Google Cloud project with My Business APIs enabled + verified brand.

## 11. Google Ads — current status

**Implemented:** OAuth connection (`google_ads_connections`), campaign/metrics sync (`lib/google-ads-sync.ts`), ROI join, offline-conversion groundwork.
**Pending:** Google Ads **developer token** (basic→standard access; note the 2026-09-09 access-model change), the MCC/customer-ID linkage, and OAuth scope `adwords`. Offline conversion upload needs a configured conversion action. Needs: Google Ads API Center approval + developer token.

---

## 12-14. Implementation plan & priority roadmap

**Phase 1 — Fix classification correctness (the priority):**
1. Extend `classifyLeadPipeline` to also output `lead_score (0-100)` + `signals[]` + `confidence` in the SAME AI call (near-zero extra cost). Migration: `leads.lead_score`, `score_confidence`, `score_signals`, + `lead_score_history`.
2. **Derive temperature from score** (per-client thresholds). **Delete/retire `detectLeadTemperature` keyword path** in the webhook — replace with "create lead at Cold/neutral, let the AI engine score it". No more 1-message-Hot.
3. Exclude converted + spam + aged-inactive from active Hot/Warm/Cold counts; add score-decay.
4. Lead detail UI: score + reasons + history.

**Phase 2 — Business-specific config + AI suggestions:**
5. `Settings → Lead Classification` (per-workspace `lead_rules`, seeded from vertical).
6. AI rule-suggestion endpoint (Accept/Edit/Reject).

**Phase 3 — Sheets sync + integrations polish:**
7. Per-workspace connected Google Sheet, one-row-per-lead upsert.

**Phase 4 — Competitor features (from research) + GMB/Ads go-live setup.**

**Recommended first step:** Phase 1 (correctness) — it directly fixes the reported bug and makes every downstream number trustworthy. Ask for approval, then implement test-first (the pure `applyLeadClassification` is already unit-tested; extend those tests for scoring).

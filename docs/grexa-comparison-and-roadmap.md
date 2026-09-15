# AGENTiX vs Grexa.ai — Competitive Analysis & Growth Roadmap

> **Status:** Research & planning only. No code, database, UI, or workflow has been changed. Nothing here is implemented. Await explicit approval before any execution.
> **Date:** 2026-09-15
> **Prepared for:** product/founder review.

---

## 0. TL;DR (Executive Summary)

**Who Grexa.ai is:** an AI marketing app for Indian local SMBs (salons, gyms, clinics, restaurants, auto repair, etc.), founded 2024 (Mumbai). Its whole pitch is **"get NEW customers from Google + engage/re-market existing ones on WhatsApp."** Three AI agents share one data brain:
1. **Google Business Profile (GBP) AI Agent** — SEO keywords, auto-writes & publishes GBP posts, replies to Google reviews, generates reviews from paying customers → rank higher on Google Search/Maps → **new-customer acquisition**.
2. **WhatsApp Chat AI Agent** — 24/7 inbound chatbot trained on the business.
3. **WhatsApp Marketing AI Agent** — promotional offers/reminders to existing customers.
4. **Data Intelligence Engine** — captures leads/customers/sales, feeds all 3 agents, segments high-potential customers.
   Packaged as: *AI GBP Suite, AI Lead Conversion Suite, AI Re-marketing Suite, AI WhatsApp Agent, AI CRM.* One flat price (₹15,000/qtr, ₹60,000/yr + GST). Lead magnet = **Free GBP Report / GBP Booster**.

**Key finding:** Grexa does **Google Business Profile (organic local SEO)**, NOT paid **Google Ads**. Google Ads is something *you* want us to add — it would put us ahead of Grexa, not just level with it.

**Who we (AGENTiX) are:** a deep, multi-tenant **WhatsApp + Instagram automation + CRM + campaign + AI platform** built as an agency/SaaS (super-admin manages many client workspaces). We are **much deeper** than Grexa on engagement, CRM, campaigns, analytics, billing, integrations, and multi-tenancy — but we are **missing the entire "Google acquisition" side** (GBP + Ads) and a **unified, cross-channel lead-source attribution** layer.

**The strategic move (not a copy):** keep our strong engagement/CRM/automation core, and add a **"Growth & Acquisition" layer** on top:
- **Google Business Profile integration** (reviews, posts, insights, review-reply AI) — closes the biggest Grexa gap.
- **Google Ads integration** (campaigns, spend, lead forms) — goes *beyond* Grexa.
- **Unified Lead & Marketing Hub** — every lead from every channel (WhatsApp, GBP, Google Ads, Meta Lead Ads, website forms, chat widget, campaigns, social) flows into ONE pipeline with **source attribution** and **cross-channel ROI reporting**.

Done right, AGENTiX becomes a **superset of Grexa**: acquisition (Google) + engagement (WhatsApp/IG) + conversion (CRM/AI) + measurement (attribution/ROI), all multi-tenant for agencies.

---

## 1. Our Existing Platform — Feature Audit (what we already have)

Verified from the live codebase (Next.js 15 App Router + Supabase Postgres/RLS, multi-tenant, deployed on Coolify). Client sidebar modules + backend surface:

### Engagement & Inbox
- **Conversations / unified inbox** — WhatsApp **and** Instagram/Messenger, real-time (Supabase Realtime), assignment, status, labels, spam, sentiment, snooze, internal notes, **campaign-scoped chat view**, media, templates.
- **AI auto-reply bot** — per-workspace persona, **Knowledge-Base RAG grounding** (pgvector + fallback keyword), multilingual (EN/Hindi/Hinglish/Marathi/Tamil/Telugu/Kannada/Bengali), button/interactive handling, provider failover (OpenAI→OpenRouter), **scope/safety guardrails** (business-only, declines off-topic/abusive — just shipped).
- **Bot pause / human handoff**, auto-CSAT (in-window), auto-resolve, auto-tagging.

### CRM & Leads
- **Contacts** — profiles, **Contact 360** (conversations, orders, CSAT, activities, notes, lifetime spend), tags, temperature, VIP, lifecycle, import (CSV/bulk), custom fields.
- **CRM Pipeline (Leads)** — stages (new/contacted/follow-up/interested/converted/lost), **Kanban**, **AI lead scoring**, temperature (hot/warm/cold, auto-cooldown), assignment, stage history, conversion review.
- **Meta Leads** — Facebook/Instagram Lead Ads captured into conversations (labelled "Meta Ad Lead") + KPIs + export.

### Campaigns & Templates
- **Campaigns** — broadcast, audience filters, scheduling, **A/B testing**, **carousel**, **LTO (limited-time offer)**, media headers, WhatsApp-validation filter, queue/progress, **per-recipient reply attribution** (send-time-guarded, `messages.campaign_id`), daily stats, retention/export.
- **Templates** — full WhatsApp template management, Meta submission, header media (image/video/PDF via resumable upload), buttons, carousel, list, LTO; **native WhatsApp Flows / in-chat forms**.

### Automation & AI
- **Flows** — chatbot flow builder + **native WhatsApp Flows** (RSA-keyed data-exchange endpoint).
- **Inbox rules engine**, **time-triggers** (idle-close, re-engage), **sequences**, **abandoned-cart** + **Shopify** webhooks, **automation triggers** (birthday, re-engagement), **auto-assign** (least-busy), **sentiment backfill**, **reply-sweep** (answer unanswered).
- **AI Revenue** — lead scoring, revenue insights, best-send-hour, hot-lead detection.
- **Knowledge Base** — vector documents (RAG), KB entries, flagged replies.

### Analytics, Billing, Ops
- **Dashboard** + **Analytics** — cross-period KPIs (%-change), message funnel, delivery/read/reply rates, CSAT, conversations, leads, campaigns, agents, extended, IST-correct, uncapped (post data-integrity audit).
- **Billing & Meta Spend** — Razorpay subscriptions/checkout/webhooks, invoices, plans, **Meta ad-spend tracking** + billing.
- **Bookings & Events**, **Tasks**, **Contact Support** (tickets), **Reports/Exports** (Conversations↔Reports parity).
- **Public REST API** (`/api/v1`), **Chat widget** (website embed), catalog.

### Platform / Multi-tenant
- **Super-admin panel** — clients, billing config, plans, meta-rates, platform analytics, client health, announcements, support.
- **Multi-tenant with RLS**, **role-based access** (super_admin/admin/manager/agent), **session limits**, per-workspace WhatsApp credentials, onboarding wizard + guided WhatsApp setup, **security-hardened** (recent IDOR/defense-in-depth audit).

**Bottom line:** we already are a **complete engagement + CRM + campaign + AI + agency platform**. Grexa's WhatsApp Chat Agent, WhatsApp Marketing Agent, and AI CRM are things we **already do, and in more depth**.

---

## 2. Grexa.ai — Deep Analysis (what they provide)

Sourced from grexa.ai homepage + public profiles (see Sources at end).

| Grexa module | What it does |
|---|---|
| **GBP AI Agent** | Finds SEO keywords; rewrites SEO-optimised GBP content/services; **auto-publishes GBP posts**; **AI replies to all Google reviews**; **generates reviews from paying customers**; goal = rank #1 on Google Search/Maps. |
| **WhatsApp Chat Agent** | 24/7 chatbot trained on the business; knows offerings/price/testimonials; remembers purchase history; sends brochures; books appointments. |
| **WhatsApp Marketing Agent** | Creates offers/visuals/messaging; picks right customers from purchase data; spots repeat-purchase opportunities; sends offers & reminders on WhatsApp. |
| **Data Intelligence Engine** | Captures & stores leads/customer/sales data; real-time intelligence to all 3 agents; analyses chats to identify leads; segments high-potential customers; tracks business KPIs in-app. |
| **Free GBP Report / GBP Booster** | Lead magnet: analyses a Google Business Profile and returns a report/score; a WhatsApp bot to "boost" GBP. |
| **AI CRM** | Basic lead/customer store + segmentation. |
| **Mobile apps** | Native Android + iOS apps. |
| **Positioning** | Google + Meta business partner; "results in 7–14 days"; 60,000+ businesses; SMB-simple, single flat plan; industry-vertical landing pages. |

**Grexa's real strengths (that we lack):**
1. **Google Business Profile automation** — the whole GBP suite (posts, reviews, review-generation, local SEO). This is their crown jewel and our #1 gap.
2. **New-customer acquisition framing** — they lead with "get found on Google," which resonates with local SMBs.
3. **Free GBP Report** — a strong self-serve lead magnet / sales funnel.
4. **Native mobile apps** — Android/iOS.
5. **Simplicity & packaging** — one price, "set it and forget it," vertical-specific messaging.

**Grexa's weaknesses (where we already win — see §4):** shallow CRM, no true multi-channel inbox, no Instagram, no deep campaign engine, no agency/multi-tenant depth, no public API, no advanced analytics/attribution, single flat plan.

---

## 3. Feature-by-Feature Comparison

Legend: ✅ have · ⚠️ partial · ❌ missing · 🏆 we're clearly ahead

| Capability | Grexa | AGENTiX | Verdict |
|---|---|---|---|
| **Google Business Profile** — posts, reviews, review-gen, local SEO | ✅ | ❌ | **Gap → build (Phase 2–3)** |
| GBP audit / "Free GBP Report" lead magnet | ✅ | ❌ | Gap → build (Phase 6) |
| **Google Ads** (paid campaigns, spend, lead forms) | ❌ | ❌ | **Opportunity → build (Phase 4), beats Grexa** |
| WhatsApp inbound chatbot | ✅ | ✅🏆 | We're deeper (KB-RAG, personas, guardrails, multilingual) |
| WhatsApp marketing/broadcast | ✅ | ✅🏆 | We're deeper (A/B, carousel, LTO, native flows, attribution) |
| Instagram/Messenger inbox | ❌ | ✅🏆 | We win |
| Unified real-time inbox (assignment, team) | ⚠️ | ✅🏆 | We win |
| CRM pipeline (stages, Kanban, scoring) | ⚠️ basic | ✅🏆 | We win |
| Contact 360 / lifetime value | ⚠️ | ✅🏆 | We win |
| **Multi-channel lead source attribution** | ⚠️ (Google+WA only) | ⚠️ (per-channel, not unified) | **Both weak → we can leapfrog (Phase 1 + 5)** |
| Meta Lead Ads capture | ❌ | ✅ | We win |
| Website forms / chat widget | ⚠️ | ✅ | We win |
| Data intelligence / segmentation | ✅ | ✅⚠️ | Parity (we have scoring/insights; formalize segments) |
| Analytics & reporting | ⚠️ | ✅🏆 | We win (funnel, CSAT, cross-period, exports) |
| Cross-channel ROI (spend vs revenue) | ❌ | ❌ | **Opportunity → build (Phase 5), beats Grexa** |
| Automation workflows (rules, sequences, triggers) | ⚠️ | ✅🏆 | We win |
| Native flows / in-chat forms | ❌ | ✅🏆 | We win |
| Billing / subscriptions / ad-spend tracking | ⚠️ | ✅🏆 | We win (Razorpay, Meta spend, invoices) |
| Public API / integrations (Shopify, catalog) | ❌ | ✅🏆 | We win |
| **Multi-tenant / agency (many clients, roles, RLS)** | ❌ single-biz | ✅🏆 | **We win big — enables reselling** |
| Native mobile apps (Android/iOS) | ✅ | ❌ | Gap (PWA/mobile later) |
| SMB simplicity / vertical templates | ✅ | ⚠️ | Adopt their packaging/vertical framing |

**Summary:** We are ahead on ~12 dimensions, at parity on ~3, and behind on ~4 (GBP, GBP report, mobile apps, SMB packaging). The 4 we're behind on are addressable; adding **Google Ads + unified attribution + cross-channel ROI** makes us strictly superior.

---

## 4. Where We Are Already More Advanced

1. **True multi-tenant agency platform** (super-admin, many client workspaces, RLS, roles, session limits) — Grexa is single-business. This lets us **resell to agencies** and manage many clients; Grexa can't.
2. **Multi-channel engagement** — WhatsApp **+ Instagram/Messenger** unified inbox; Grexa is WhatsApp-only.
3. **Depth of campaign engine** — A/B, carousel, LTO, scheduling, native WhatsApp Flows, per-recipient reply attribution.
4. **Real CRM** — pipeline, Kanban, AI scoring, temperature auto-cooldown, Contact 360, lifetime value, stage history.
5. **AI depth** — KB/RAG grounding, personas, multilingual, provider failover, safety guardrails, sentiment, suggested replies, revenue insights.
6. **Analytics & data integrity** — funnel, CSAT, cross-period KPIs, Reports↔Conversations parity, all uncapped/IST-correct (post-audit).
7. **Automation breadth** — inbox rules, time-triggers, sequences, abandoned-cart, Shopify, auto-assign/resolve/CSAT/tag.
8. **Commercial infra** — Razorpay billing, Meta ad-spend tracking, invoices, public API, chat widget.
9. **Security posture** — recent whole-codebase IDOR/defense-in-depth hardening.

---

## 5. Missing Features (Gaps to Close)

1. **Google Business Profile integration** (the big one): connect a client's GBP; read locations, reviews, Q&A, insights/performance; write GBP posts; **AI review replies**; **review-request generation**; local-SEO content.
2. **GBP audit / "Free GBP Report"** self-serve lead magnet (sales funnel).
3. **Google Ads integration** (beyond Grexa): connect Ads account; pull campaigns/spend/performance; **capture Google Ads Lead-Form leads**; conversion/ROI tracking.
4. **Unified multi-channel lead source attribution**: today `leads.source`, `conversations.source_campaign_id`, and the "Meta Ad Lead" label exist but are **not unified into one attribution model + one Leads hub + one cross-channel report**.
5. **Review management** as a first-class module (currently none).
6. **Native mobile apps** (or a PWA) — later.
7. **SMB packaging / vertical onboarding** (salon, gym, clinic templates) — product/marketing.

---

## 6. New Advanced Opportunities (make us clearly better than Grexa)

1. **Unified Lead & Marketing Hub** — one pipeline where every lead (WhatsApp, GBP, Google Ads, Meta Lead Ads, website form, chat widget, campaign, social, API) lands with a **normalized `source` + `channel` + `campaign` + `utm`** and **de-dup by phone/email** across channels.
2. **Cross-channel customer journey** — timeline of every touchpoint (saw GBP → messaged on WhatsApp → clicked an Ad → ordered), per contact.
3. **Cross-channel ROI / attribution reporting** — combine **Google Ads spend + Meta ad spend** (we already track Meta spend) vs **leads + conversions + revenue** → cost-per-lead, ROAS, best channel — Grexa has nothing like this.
4. **AI "Growth Copilot"** — one assistant that reads all channels and recommends actions ("reply to these 3 negative reviews," "your GBP post is due," "these 12 leads went cold — send this WhatsApp offer," "shift ₹X from Ad group A to B").
5. **Automated cross-channel lead routing** — a Google Ads lead auto-creates a WhatsApp follow-up + a CRM lead + assigns an agent.
6. **AI review management** — reply to Google reviews using our existing AI+KB+sentiment stack, escalate negatives to a human/task.
7. **Local-SEO content engine** — GBP posts generated from the client's Knowledge Base (we already have the KB + AI).
8. **White-label agency marketing dashboards** — extend our multi-tenant admin into client-facing, brandable "your marketing in one place" dashboards (a real agency product Grexa can't offer).
9. **Conversion & offline-conversion upload** — push WhatsApp/CRM conversions back to Google Ads / Meta for smarter ad optimization (advanced, high-value).

---

## 7. Recommended Product Architecture

**Principle:** additive, non-breaking. New tables/routes/modules; the existing WhatsApp/CRM core is untouched and becomes the "engagement + conversion" layer of a bigger hub.

### 7.1 New conceptual layers
- **Channels & Sources layer** — a normalized model for *where a lead/touchpoint came from*: `channel` (whatsapp, instagram, gbp, google_ads, meta_ads, website, chat_widget, campaign, api, manual) + `source_detail` (campaign id, ad id, gbp location, utm). Applied to leads/contacts/conversations.
- **Integrations layer** — per-workspace OAuth connections to Google (GBP + Ads), stored encrypted, mirroring how per-workspace WhatsApp creds already work.
- **Unified Lead Hub** — a view/service over leads across all channels + attribution + journey.
- **Growth modules** — GBP module, Google Ads module, Reviews module, Attribution/ROI dashboards.

### 7.2 New data (all additive — no change to existing tables' behavior)
- `google_integrations` (workspace_id, type[gbp|ads], oauth tokens encrypted, account/customer id, scopes, status, connected_by, expiry).
- `gbp_locations`, `gbp_reviews`, `gbp_posts`, `gbp_insights` (per location).
- `google_ads_accounts`, `google_ads_campaigns`, `google_ads_metrics`, `google_ads_leads`.
- `lead_sources` / extend `leads` + `contacts` with `channel`, `source_detail`, `utm_*`, `first_touch`, `last_touch` (nullable columns → non-breaking).
- `marketing_touchpoints` (contact_id, channel, type, ref, occurred_at) for the journey timeline.
- Reuse existing: `leads`, `contacts`, `conversations`, `campaigns`, `meta_spend*`.

### 7.3 New backend
- Google OAuth start/callback routes (per-workspace connect).
- GBP sync jobs (reviews/insights pull via cron), GBP write (posts, review replies).
- Google Ads sync jobs (campaigns/metrics), Google Ads Lead-Form webhook receiver.
- Attribution service (normalize + de-dup + roll-up).
- Extend AI (`getAIReply`/`callAI`) for review replies + GBP post generation (reuse KB + guardrails).

### 7.4 New frontend
- "Growth" section in the client sidebar: **Google Profile**, **Google Ads**, **Reviews**, **Unified Leads**, **Attribution/ROI**.
- Super-admin: connection status + usage per client.

### 7.5 Multi-tenant model (a key product decision — see §10 Q1)
- **Agency-connect (recommended):** Agentix runs ONE verified Google OAuth app; each client authorizes their own GBP/Ads accounts to it. We manage tokens per workspace. Cleaner UX, one approval.
- vs **BYO-app:** each client brings their own Google Cloud project (heavy, unrealistic for SMBs).

---

## 8. Required APIs, Integrations, Credentials & Third-Party Services

| Need | What / why | Who gets it |
|---|---|---|
| **Google Cloud project** | Host OAuth client + enable APIs | You (or approve me to set up under your Google account) |
| **OAuth 2.0 client (web)** | Per-workspace Google connect | Config in Cloud console |
| **OAuth consent screen — verified app** | Sensitive/restricted scopes (GBP, Ads) require Google app **verification** (privacy policy, domain, brand review) | You + me (I prepare; you own the brand/legal) |
| **Google Business Profile API access** | GBP read/write. **Requires a separate access request/allowlisting + quota approval** from Google (can take days–weeks) | You submit (needs your Google/business identity); I prepare the application |
| **Google Ads API developer token** | Ads read/write. **Requires a Google Ads Manager (MCC) account + token application; starts at "test", then "basic" access approval** | You create the MCC + apply; I guide |
| **Privacy policy + terms URLs** | Required for OAuth verification | Confirm we have these live (we have app.aiagentixdev.com) |
| **A real GBP + a real Google Ads account** to develop/test against | Sandbox/dev testing | You (a client's or a test account) |
| **Google Pub/Sub** (optional) | Real-time GBP review/message notifications | Cloud config |
| **Secrets storage** | Encrypt OAuth tokens at rest | We add (env + encryption) |
| Existing: WhatsApp, Meta, Razorpay, Supabase, Resend | Already integrated | Have |

**Important dependency/risk:** Google Business Profile API **and** Google Ads API both require **application + human approval by Google** before production use. These approvals are the critical-path, external dependency for Phases 2–4 (start them EARLY).

---

## 9. Impact on the Existing System

- **Database:** only **new tables** + **new nullable columns** on `leads`/`contacts` (source attribution). No change to existing columns' meaning → existing queries unaffected. RLS policies added for new tables (workspace-scoped, matching our post-audit standard).
- **Backend:** only **new routes/crons/services**. No change to WhatsApp webhook, campaigns, or CRM logic (attribution reads/writes are additive).
- **Frontend:** only **new sidebar modules**. Existing pages untouched.
- **Automation:** new jobs (GBP/Ads sync) run alongside existing crons; no change to current automation.
- **Auth/permissions:** new permissions (`manage_integrations`, `view_growth`) added to the existing role system; a new OAuth flow (Google) separate from login.
- **Security:** OAuth tokens encrypted at rest; per-workspace scoping enforced (following the recent defense-in-depth pattern); Google webhooks signature/verify-gated.
- **Multi-tenant:** every new table workspace-scoped; Google connections per workspace (like WhatsApp creds today).

**Net:** low risk to existing functionality because everything is additive and isolated.

---

## 10. Phase-Wise Implementation Plan

Each phase is independently shippable and reversible. External Google approvals (Phase 2–4) should be **started during Phase 1** since they gate later work.

### Phase 0 — Research & Audit *(this document)*
- **Done:** platform audit, Grexa analysis, comparison, gaps, opportunities, architecture, requirements.
- **From you:** review + approve direction; answer the decisions in §11.

### Phase 1 — Unified Lead & Source Foundation *(internal only, no external APIs)*
- **What:** normalized `channel`/`source_detail`/`utm`/touchpoints model; back-fill existing sources (WhatsApp, Meta Lead Ads, campaigns, chat widget); a **Unified Leads** view + basic source attribution report.
- **Why first:** delivers value immediately, sets the schema every later channel plugs into, zero external dependency.
- **DB:** new nullable columns on `leads`/`contacts`; `marketing_touchpoints` table; RLS.
- **Backend:** attribution service; touchpoint writers hooked into existing lead/conversation creation.
- **Frontend:** Unified Leads page + a source-breakdown chart.
- **Risk:** low. **Approvals:** none external.

### Phase 2 — Google OAuth + GBP (read-only)
- **What:** per-workspace "Connect Google" flow; pull GBP **locations, reviews, Q&A, insights/performance**; a read-only **Reviews inbox** + **GBP dashboard**.
- **Why:** closes the biggest Grexa gap with the lowest-risk (read-only) first step.
- **Deps:** Google Cloud project, OAuth client, **GBP API access approval**, verified consent screen.
- **DB:** `google_integrations`, `gbp_locations`, `gbp_reviews`, `gbp_insights`.
- **Backend:** OAuth routes; GBP sync cron; token refresh + encryption.
- **Frontend:** Google Profile + Reviews modules.
- **Risk:** external approval timeline. **Approvals:** Google API access (you).

### Phase 3 — GBP Write + AI Agent
- **What:** **AI review replies** (our AI+KB+sentiment, human-approve option), **auto GBP posts** from KB, Q&A answers, **review-request** flows (send WhatsApp asking happy customers to review). This is our "GBP AI Agent," matching Grexa.
- **Why:** turns read-only into active acquisition automation.
- **Deps:** Phase 2 + GBP write scopes.
- **DB:** `gbp_posts`; review-reply status.
- **AI:** extend `getAIReply`/content-gen with GBP context + guardrails.
- **Risk:** content quality/compliance (Google review-reply policies); keep human-approval toggle. **Approvals:** you (auto-post on/off policy).

### Phase 4 — Google Ads Integration *(beyond Grexa)*
- **What:** connect Google Ads; pull **campaigns/ad-groups/spend/performance**; receive **Google Ads Lead-Form leads** (webhook) → create CRM lead + WhatsApp follow-up; **spend vs leads** view.
- **Why:** neither Grexa nor most competitors do this — strong differentiator; unifies paid acquisition with our engagement.
- **Deps:** **Google Ads API developer token + MCC**, OAuth scopes.
- **DB:** `google_ads_accounts/campaigns/metrics/leads`.
- **Backend:** Ads sync cron; Lead-Form webhook; lead-router.
- **Frontend:** Google Ads module.
- **Risk:** dev-token approval timeline; Ads API complexity. **Approvals:** you (MCC + token application).

### Phase 5 — Cross-Channel Attribution, ROI & Growth Copilot
- **What:** unify **all** sources (WhatsApp, GBP, Ads, Meta, website, campaigns) into one attribution + **customer-journey timeline** + **ROI dashboard** (Google Ads + Meta spend vs leads/revenue → CPL, ROAS); **AI Growth Copilot** recommendations; **automated cross-channel routing**.
- **Why:** the "one place for your whole marketing" vision; clearly beats Grexa.
- **Deps:** Phases 1–4 data.
- **Risk:** medium (data modeling), no new external approvals.

### Phase 6 — Free GBP Report (lead magnet) + Vertical Packaging
- **What:** public **"Free GBP Report"** tool (enter a business → GBP audit/score → capture lead → sales funnel), vertical onboarding templates (salon/gym/clinic), SMB packaging.
- **Why:** matches Grexa's top funnel; drives self-serve growth.
- **Risk:** low.

### Phase 7 — Mobile (PWA/apps), Optimization & Advanced AI
- **What:** PWA or native apps; performance/scale; offline-conversion upload to Google/Meta; advanced predictive insights.
- **Risk:** scoped later.

---

## 11. What Is Required From My Side (You)

### A. Decisions / approvals needed BEFORE we start (product)
1. **Connection model:** agency-connect (Agentix's one verified Google app; clients authorize their accounts) — **recommended** — vs each client bringing their own Google Cloud project. *(Your call.)*
2. **Scope & order:** confirm the phase order, and whether to **lead with GBP** (match Grexa) or **lead with the Unified Lead Hub + Google Ads** (leapfrog). Recommended: Phase 1 (internal) → Phase 2/3 (GBP) → Phase 4 (Ads) → Phase 5.
3. **Auto-post / auto-reply policy:** should the GBP agent post/reply **automatically** or **human-approve** by default? (Affects Google-policy risk.)
4. **Packaging/pricing:** is this a new add-on tier, or included? (Business decision.)
5. **Approval to create a planning branch / write specs** (still no functional code) if you want detailed specs next.

### B. Credentials / access I will need (per phase, when we reach it)
- **Phase 2–3 (GBP):** a **Google Cloud project** (yours, or approve me to set one up under your Google account); ability to **submit the Google Business Profile API access request** (needs your Google/business identity — I'll prepare the form); a **real Google Business Profile** (a client's or test) to develop against; confirm our **privacy policy + terms URLs** are live for OAuth verification.
- **Phase 4 (Google Ads):** a **Google Ads Manager (MCC) account** (you create) and submitting the **developer-token application** (I'll guide); a **test Ads account**.
- **General:** OAuth client id/secret (generated in the Cloud console once the project exists); optional Google **Pub/Sub** enablement for real-time review notifications.
- **You do NOT need to give me:** your login passwords, or per-client Google passwords — clients connect via OAuth themselves; I only need the app-level (Agentix) Google Cloud/OAuth setup + approvals.

### C. What I can do WITHOUT you (no involvement needed)
- All of **Phase 0** (this doc) and detailed **specs/architecture** for every phase.
- **Phase 1** (unified lead/source foundation) end-to-end — it uses only our own data, no Google access.
- Prepare the **Google API application drafts**, OAuth consent-screen content, DB migration designs, and code scaffolding plans — ready for the moment approvals/credentials arrive.

### D. What needs YOU specifically
- Submitting Google's **API access + developer-token applications** (identity/ownership-bound).
- **Creating the Google Cloud project + MCC** (or explicitly authorizing me to, under your Google account).
- The **product/pricing decisions** in §11.A.
- Providing **test Google accounts** (GBP + Ads).

---

## 12. Recommended Immediate Next Steps (no build yet)
1. You review this doc and answer §11.A (esp. connection model + phase order).
2. **In parallel, start the slow external approvals now** (they gate everything): create the Google Cloud project, request **GBP API access**, create the **Google Ads MCC + apply for a developer token**. These take days–weeks — starting today saves the most time.
3. On your approval, I write the **Phase 1 spec** (internal unified-lead foundation — buildable with zero external dependency) so we make real progress while Google approvals are pending.

---

## Sources
- Grexa homepage & product copy — https://grexa.ai/
- GBP Booster / WhatsApp AI bot — https://grexa.ai/gbp-booster-whatsapp-ai-bot
- Pricing — https://grexa.ai/pricing
- Crunchbase — https://www.crunchbase.com/organization/grexa
- Tracxn — https://tracxn.com/d/companies/grexa
- YourStory (MSME AI) — https://yourstory.com/2025/08/automated-success-how-grexa-is-driving-up-revenue-msmes-ai
- Google Play / App Store listings — Grexa Marketing AI Platform
- Our platform: verified from the AGENTiX codebase (this repo).

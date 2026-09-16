# Phase 2 — Google Business Profile (GBP) Integration Spec

> **Scope (chosen):** Full suite — **Reviews + Posts + Q&A + Insights**, plus Connect + Locations, wired into the Phase 1 Unified Lead Hub (`gbp` channel).
> **Principle:** additive & non-breaking; **human-approve by default** for anything published to Google; multi-tenant + workspace-scoped RLS from the start (post-audit standard).
> **Model:** one shared AGENTiX Google app (same OAuth client as Google Calendar) — each workspace authorizes with the `business.manage` scope; refresh token stored per workspace.

---

## 0. External prerequisites (Google — the long pole, user action)

These gate live data but **not** the code build:

1. **Enable "Google Business Profile API"** (+ the sub-APIs below) in the GCP project.
2. **Submit the GBP API access request form** — per-project approval, days-to-weeks. Until approved, the APIs return 403 even for the account owner.
3. **Add `https://www.googleapis.com/auth/business.manage`** to the OAuth consent screen; verification via the same flow as the Calendar scope. Works for **test users** in Testing mode meanwhile (≤100 users, 7-day token refresh).

**Google APIs used (all under the single `business.manage` scope):**
- Account Management — `mybusinessaccountmanagement.googleapis.com` (list accounts)
- Business Information — `mybusinessbusinessinformation.googleapis.com` (locations)
- Reviews + Local Posts — My Business **v4** `mybusiness.googleapis.com/v4` (reviews, replies, localPosts)
- Q&A — `mybusinessqanda.googleapis.com` (questions, answers)
- Performance/Insights — `businessprofileperformance.googleapis.com`

---

## 1. Data model (migration 089 — additive, RLS on every table)

- **`gbp_connections`** — `id, workspace_id (unique), google_account_id, account_name, email, refresh_token, scope, connected_at, last_synced_at, status`.
- **`gbp_locations`** — `id, workspace_id, connection_id, location_id (Google name/id), title, address, primary_phone, website_uri, is_active, raw jsonb, created_at`. One workspace may manage several locations.
- **`gbp_reviews`** — `id, workspace_id, location_id, review_id (unique per location), reviewer_name, star_rating (int 1-5), comment, create_time, update_time, reply_comment, reply_update_time, reply_status ('none'|'draft'|'approved'|'posted'), ai_draft, raw jsonb`.
- **`gbp_posts`** — `id, workspace_id, location_id, post_id (nullable until published), topic_type ('STANDARD'|'OFFER'|'EVENT'|'ALERT'), summary, media_url, cta_type, cta_url, status ('draft'|'approved'|'published'|'failed'), scheduled_at, published_at, created_by, raw jsonb`.
- **`gbp_questions`** — `id, workspace_id, location_id, question_id (unique), author_name, text, create_time, answer_text, answer_status ('none'|'draft'|'approved'|'posted'), ai_draft, raw jsonb`.
- **`gbp_insights_daily`** — `id, workspace_id, location_id, date, metric, value` (cached daily performance: views, searches, calls, direction requests, website clicks). Unique `(location_id, date, metric)`.

All tables: `enable row level security` + `for all using (public.is_workspace_member(workspace_id))`. Indexes on `(workspace_id, location_id, …)`.

## 2. Backend

### 2.1 `lib/google-business.ts` (API client — mirrors lib/google-calendar.ts)
- `getGbpOAuthUrl(workspaceId)` → consent URL with `business.manage`, `access_type=offline`, `prompt=consent`, `state=workspaceId`.
- `exchangeCodeForTokens(code)` / `refreshAccessToken(refreshToken)` (reuse the Calendar token exchange; same client id/secret).
- `listAccounts(accessToken)`, `listLocations(accessToken, accountId)`.
- `listReviews(accessToken, locationName, pageToken?)`, `replyToReview(accessToken, reviewName, comment)`.
- `listQuestions(...)`, `upsertAnswer(...)`.
- `createLocalPost(accessToken, locationName, post)`, `listLocalPosts(...)`.
- `getPerformanceMetrics(accessToken, locationName, from, to)`.
- All fail-soft: return `{ ok, data | error }`, never throw into callers.

### 2.2 Sync
- **`lib/gbp-sync.ts`** — `syncWorkspaceGbp(db, workspaceId)`: refresh token → pull locations, reviews, questions, insights → upsert into tables; record a `gbp` touchpoint (Phase 1 `recordTouchpoint`) for each new review/question so GBP interactions land in the Unified Lead Hub.
- **Cron** — extend the existing cron to call `syncWorkspaceGbp` for every connected workspace (e.g. every 30–60 min). New reviews/questions optionally get an AI draft reply (business persona) with `*_status='draft'` — **never auto-posted**.

### 2.3 AI drafting
- Reuse `callAI` + the workspace persona/KB to draft review replies and Q&A answers. Output stored as `ai_draft` / `reply_comment` with status `draft`. A human edits + approves before anything is sent to Google.

### 2.4 APIs (all `requireWorkspacePermission`, workspace-scoped)
- **Connect:** `GET /api/integrations/gbp/connect` (redirect to consent), `GET /api/integrations/gbp/callback` (store token + trigger first sync), `GET /api/integrations/gbp/status`, `POST /api/integrations/gbp/disconnect`, `POST /api/integrations/gbp/sync` (manual re-sync).
- **Locations:** `GET /api/gbp/locations`.
- **Reviews:** `GET /api/gbp/reviews?locationId=&rating=&status=`, `POST /api/gbp/reviews/[id]/draft` (AI draft), `POST /api/gbp/reviews/[id]/reply` (approve + post to Google).
- **Posts:** `GET/POST /api/gbp/posts`, `POST /api/gbp/posts/[id]/publish`.
- **Q&A:** `GET /api/gbp/questions`, `POST /api/gbp/questions/[id]/answer`.
- **Insights:** `GET /api/gbp/insights?locationId=&from=&to=`.

## 3. Frontend
- **New sidebar item "Google Business"** (`/google-business`, agent-restrictable key `google-business`) with tabs:
  - **Reviews** — list (rating filter), each row: reviewer, stars, comment, AI-draft button, editable reply box, **Approve & Reply** (posts to Google). Bulk "draft all unanswered".
  - **Posts** — composer (topic/offer/event, media, CTA) → save draft → **Approve & Publish**; list of published/scheduled posts.
  - **Q&A** — unanswered questions, AI-draft answer, **Approve & Answer**.
  - **Insights** — location performance charts (views, calls, directions, website clicks) over a date range.
- **Settings → Integrations** — a "Google Business Profile" card: Connect / Connected (account + locations) / Disconnect / Sync now. (Mirrors the existing Google Calendar card.)
- Empty/disconnected state explains the connect step and the API-access requirement.

## 4. Human-approve guardrail (non-negotiable default)
Nothing is written to Google without an explicit human **Approve** click. AI only produces drafts. A workspace-level optional toggle "auto-post AI review replies" may be added later, **off by default**.

## 5. Multi-tenant / security
- Every table RLS-scoped; every API uses `requireWorkspacePermission`; the admin client is always explicitly `.eq('workspace_id', …)`.
- Refresh tokens stored per workspace; disconnect wipes them. (Encryption-at-rest note: tokens sit in Postgres; treat like the existing Calendar token — a later hardening task can envelope-encrypt all Google tokens uniformly.)

## 6. Lead-hub integration (Phase 1 payoff)
New reviews and questions create `gbp` touchpoints (with the reviewer/asker as a lightweight contact where a match/identity exists, else a location-level touchpoint) so GBP shows up in `/leads` source breakdown and contact journeys.

## 7. Build order (tasks)
1. Migration 089 (tables + RLS + indexes).
2. `lib/google-business.ts` (API client) + `lib/gbp-sync.ts` + unit tests for the pure bits (rating parsing, draft-status transitions).
3. Connect/callback/status/disconnect/sync APIs + Settings integration card.
4. Reviews API + UI (highest value first).
5. Q&A API + UI.
6. Posts API + UI.
7. Insights API + UI.
8. Cron sync + `gbp` touchpoint attribution.
9. Verify (tsc, tests, testing-mode spot-check once Google access lands), push, redeploy.

## 8. What this unlocks
GBP reviews/posts/Q&A/insights managed from AGENTiX with AI drafts + human approval, and GBP folded into the unified cross-channel lead view — matching and exceeding Grexa's GBP feature set, on top of everything AGENTiX already does.

# Phase 4 — Google Ads Integration Spec

> **Goal:** bring Google Ads into AGENTiX — capture Ads leads into the Unified Lead Hub, and show campaign spend/performance — so a business sees WhatsApp, Instagram, Meta Ads, GBP **and** Google Ads in one place. Beyond Grexa (which has no Google Ads).
> **Principle:** additive, multi-tenant (RLS), human-safe. Split into two independently shippable parts.

## Two parts (by dependency)

### Part A — Lead capture (NO developer token needed) — ship first
Google Ads **Lead Form** assets deliver each submission to a **webhook** you configure (URL + secret key) on the asset. This is independent of the Ads API, so it works immediately.
- **Endpoint:** `POST /api/webhooks/google-ads-leads` — validates Google's `google_key` against a per-workspace secret, parses `user_column_data` (name/email/phone/…), then creates/updates a contact + lead with `channel='google_ads'`, `source_detail=campaign/form name`, and records a `google_ads` touchpoint (Phase 1 `recordTouchpoint`). Fail-open + idempotent on `lead_id`.
- **Config:** per-workspace webhook secret shown in Settings so the user pastes the webhook URL + key into their Lead Form asset. No OAuth, no token.

### Part B — Reporting (needs Google Ads API) — build in parallel, live on approval
- **OAuth** `https://www.googleapis.com/auth/adwords` per workspace (same Google app as Calendar/GBP); store refresh token + `customer_id` (+ `login_customer_id` for manager access).
- **API:** Google Ads REST `googleads.googleapis.com/v17/customers/{id}/googleAds:search` with GAQL to read campaigns, cost, clicks, impressions, conversions.
- **Dashboard:** campaigns table + spend/clicks/conversions KPIs + date range.

## External prerequisites (Part B only — the long pole, user action)
1. **Google Ads Manager (MCC) account** (ads.google.com → create manager account, if none).
2. **Developer token** from the MCC → Tools & Settings → **API Center**; then **apply for Basic access** (form describing the tool + policy agreement) — approval takes days.
3. **`adwords` scope** on the OAuth consent screen — sensitive scope, verification via the same flow as calendar/GBP (works for test users meanwhile).
Part A needs none of this.

## Data model (migration 090 — additive, RLS on every table)
- **`google_ads_connections`** — `id, workspace_id (unique), refresh_token, customer_id, login_customer_id, email, status, connected_at, last_synced_at`.
- **`google_ads_campaigns`** — `id, workspace_id, customer_id, campaign_id, name, status, channel_type, cost_micros, clicks, impressions, conversions, date, raw` (cached daily metrics; unique `(workspace_id, campaign_id, date)`).
- **`google_ads_lead_secrets`** — `id, workspace_id (unique), webhook_key` (the per-workspace secret for Part A). (Or store on workspaces.settings — a dedicated table keeps it rotatable.)

## Backend
- **`lib/google-ads.ts`** — OAuth url/exchange/refresh (adwords scope) + `searchGaql(accessToken, customerId, loginCustomerId, devToken, query)` returning `{ok,data|error}` (fail-soft). Reads `GOOGLE_ADS_DEVELOPER_TOKEN` from env.
- **`lib/google-ads-sync.ts`** — `syncWorkspaceAds(db, workspaceId)`: GAQL pull of campaigns + last-30-day metrics → upsert `google_ads_campaigns`.
- **Webhook** (Part A): `app/api/webhooks/google-ads-leads/route.ts` (key-validated → contact+lead+touchpoint).
- **APIs:** `/api/integrations/google-ads/{connect,callback,status,disconnect,sync}`, `/api/google-ads/campaigns`, `/api/google-ads/lead-webhook-info` (returns the workspace webhook URL + key for setup).

## Frontend
- **New "Google Ads" page** (`/google-ads`, agent key `google-ads`): Campaigns/spend dashboard (Part B) + a "Lead form setup" panel showing the webhook URL + key to paste into Google Ads (Part A).
- **Settings → Integrations → "Google Ads"** card (connect/disconnect/status).
- Google Ads leads flow into the existing `/leads` Unified hub automatically (channel `google_ads`).

## Multi-tenant / security
- Every table RLS-scoped; APIs `requireWorkspacePermission`; webhook validates the per-workspace key and is workspace-scoped; refresh tokens per workspace.

## Build order
1. Migration 090.
2. Part A: webhook + lead-secret + Settings/setup UI (**ship first — no approval needed**).
3. `lib/google-ads.ts` + `lib/google-ads-sync.ts` + connect flow.
4. Campaigns dashboard + Settings card.
5. Verify (tsc, tests), push, redeploy. (Part B live once dev token + adwords scope land.)

## What this unlocks
Google Ads leads + spend join the unified cross-channel view, enabling true multi-channel ROI (Phase 5): cost per lead and conversion by channel across Meta Ads, Google Ads, GBP, WhatsApp and Instagram.

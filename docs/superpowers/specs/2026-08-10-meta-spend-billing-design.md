# Meta Spend & Billing Module (Meta Reported Spend)

**Date:** 2026-08-10
**Status:** Approved design, pending implementation plan

## Problem

Clients must leave the portal and open Meta's interface to see what Meta charges them for
WhatsApp activity. We want a native, multi-tenant **Meta Spend & Billing** module so every
client can answer "how much have I spent on Meta?" — by date, with category breakdown, chart,
history, and export — using **real Meta-reported figures**, never fabricated numbers.

## Phase 1–3 findings (audit → Meta reality → gap)

**Verified live against real client tokens (do not re-derive):**
- Meta's **`GET /{waba_id}/pricing_analytics`** returns **real cost**. With
  `granularity=DAILY` + `dimensions=["PRICING_CATEGORY"]` each data point is
  `{ start, end, pricing_category, volume, cost }` (e.g. Razorveda MARKETING one day:
  volume 6448, cost 5565.27). This is the **source of truth**.
- The **`GET /{waba_id}?fields=currency,timezone_id`** node returns the account's billing
  **currency** (e.g. `INR`) and `timezone_id` — so currency/timezone are **detected**, not hardcoded.
- Pricing categories: `MARKETING`, `UTILITY`, `AUTHENTICATION`, `SERVICE` (and `PRICING_TYPE`
  = REGULAR / FREE_* — not stored in this module).

**Existing infra (reuse, don't duplicate):** `app/api/admin/meta-billing/*` (admin-only,
monthly, computes cost from a hardcoded rate card — the new module replaces that cost basis
with Meta's real `cost`); `meta_billing_snapshots` (admin monthly — left as-is); the
`lib/export-stream.ts` engine; cron/notify/RLS patterns.

**Hard limitation (accepted):** Meta does **not** attribute spend to *our* campaigns. This
module therefore shows **only real Meta Reported Spend** — **no campaign-level spend, no
estimates.** (Campaign attribution was explicitly de-scoped.)

## Decisions (from brainstorming)

1. **Real Meta Reported Spend only** — no campaign attribution, no invented numbers.
2. **Daily sync** from `pricing_analytics` + a manual **Refresh**; dashboard reads local data.
3. **Currency native**, detected per WABA from Meta; no conversion.
4. Financial data is **excluded from campaign-retention cleanup** (separate retention).
5. Build the whole module in one cycle (client dashboard + admin view + sync + export).

## Data model (migration)

**`meta_spend_daily`** — the granular source everything aggregates from:
```
workspace_id  uuid  (FK workspaces, on delete cascade)
waba_id       text
day           date            -- UTC date of the bucket midpoint (see Day bucketing)
category      text            -- MARKETING | UTILITY | AUTHENTICATION | SERVICE | other
volume        integer NOT NULL DEFAULT 0
cost          numeric(14,4) NOT NULL DEFAULT 0
currency      text            -- e.g. 'INR', from the WABA node
synced_at     timestamptz NOT NULL DEFAULT now()
PRIMARY KEY (workspace_id, day, category)      -- dedup / idempotent upsert
INDEX (workspace_id, day)
```
RLS: **deny-all** to client roles (service-role / admin-client only; the API enforces access).

**`meta_spend_sync`** — one audit row per sync run: `id, workspace_id, range_start date,
range_end date, rows_upserted int, status text ('ok'|'error'), error text, created_at`.
RLS deny-all.

**Day bucketing (avoids off-by-one):** Meta's DAILY buckets are aligned to the account's
midnight; store `day = UTC date of (start + (end-start)/2)` (the bucket midpoint), which lands
inside one UTC calendar day for any realistic timezone offset. The dashboard displays the
account timezone (from `timezone_id`) so "Today" is unambiguous.

## Sync service + cron

**`POST /api/cron/meta-spend-sync`** (Bearer `CRON_SECRET`), also callable per-workspace by the
Refresh button (see API). For each active workspace with a `waba_id` + token:
1. Fetch `currency` (+ `timezone_id`) from the WABA node once.
2. Fetch `pricing_analytics` (`granularity=DAILY`, `dimensions=["PRICING_CATEGORY"]`,
   `start = now - 35 days`, `end = now`) — a rolling window so Meta's restatements of recent
   days are captured.
3. For each data point → `day`, `category`, `volume`, `cost`, `currency`; **upsert** into
   `meta_spend_daily` on `(workspace_id, day, category)` (so re-running never double-counts and
   always reflects Meta's latest values).
4. Write a `meta_spend_sync` audit row (rows upserted / error).
Server-side only (tokens never reach the client). Sequential per workspace with a short delay +
try/catch per workspace so one bad tenant can't fail the batch. Scheduled daily via pg_cron
(inlined secret, like the reply-sweep job).

## Client dashboard — `Billing & Meta Spend`

New sidebar entry. Reads only `meta_spend_daily` (never calls Meta on page load).

- **Headline:** Total Meta Reported Spend for the selected period, in the account currency.
- **Cards:** Today · This Week · This Month · Selected period — each with % change vs the
  previous equivalent period.
- **Date filters:** quick (Today, Yesterday, Last 7 Days, This/Last Week, This/Last Month,
  Last 30/90 Days, This Year) + custom range. The whole page reflects the selection.
- **Spend-over-time chart** (bucketed daily/weekly/monthly by range) — reuse the charting
  component already used on the Analytics page (don't introduce a new chart library).
- **Category breakdown** (Marketing / Utility / Authentication / Service) — real Meta dimension.
- **Billing history** table (per-day rows: date, category, volume, cost) with sort + **Export**.
- **"Last synced Xm ago"** + a **Refresh** button.
- A clear label: **"Meta Reported Spend — usage-based figures reported by Meta; taxes/credits on
  your final invoice may differ."** No campaign spend shown.

## API

All under `app/api/billing/meta-spend/…`, auth `requireWorkspacePermission(workspaceId,
'view_analytics')` (the existing analytics permission — a spend dashboard is analytics-tier;
super_admin/admin/manager hold it), workspace-scoped:
- **`GET …/summary?workspaceId=&from=&to=`** → totals, per-period cards + %-change, category
  breakdown, currency, `last_synced_at`.
- **`GET …/series?workspaceId=&from=&to=&bucket=day|week|month`** → chart series.
- **`GET …/history?workspaceId=&from=&to=`** → per-day rows (also the export source).
- **`GET …/export?workspaceId=&from=&to=`** → CSV via `lib/export-stream.ts` (uncapped),
  filters applied.
- **`POST …/refresh` `{ workspaceId }`** → runs the sync for that one workspace, returns
  `{ ok, rows, last_synced_at }`.

## Admin (super-admin) view

Extend `admin/meta-billing`: platform total spend, spend by client, by date, top spenders, and
recent sync failures (`meta_spend_sync` where status='error'). Strictly `is_platform_admin`.

## Financial retention (critical)

`meta_spend_daily` and `meta_spend_sync` are **financial records** — they are **NOT** touched by
the campaign-retention cleanup (which only deletes `campaign_recipients` / `campaign_queue`).
They have their own long/indefinite retention. This is called out explicitly so no future
cleanup deletes billing data.

## Multi-tenant security

Every query filters `workspace_id`; the tables are RLS deny-all (service-role only) and reached
only through the permission-gated API. Tokens/credentials never leave the server. Cross-tenant
isolation is explicitly tested (a request for workspace A's spend as a member of B → 403).

## Currency & timezone

- Currency stored per row from the WABA node; the dashboard renders that currency (₹, $, …). No
  conversion; the Meta-reported amount is never altered.
- Timezone: bucketing uses Meta's own daily buckets (midpoint→UTC date); the dashboard shows the
  account timezone so period filters are unambiguous.

## Testing

- **Unit:** period aggregation (total / today / week / month, %-change vs previous period);
  quick-filter date-range resolution; day-bucketing from a Meta `{start,end}` pair (off-by-one
  boundary); pricing_analytics response parsing → normalized rows; dedup (upsert same day twice
  → one row, latest value).
- **Integration/live (controller):** run the sync against a real WABA (Razorveda) and confirm
  `meta_spend_daily` populated with per-day per-category cost matching the live API; confirm
  currency detected; confirm re-running the sync doesn't multiply totals.
- **Security:** cross-tenant summary/export request → 403; tables not readable by client roles.

## Rollout

Additive migration (two new tables + cron) applied live by the controller; code (sync + API +
dashboard + admin) requires redeploy. No existing table/behaviour changed; `meta_billing_snapshots`
and the admin monthly view remain.

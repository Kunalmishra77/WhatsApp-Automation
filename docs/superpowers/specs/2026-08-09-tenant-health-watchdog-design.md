# Tenant Health Watchdog — Detect & Alert on Silent Tenants

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan

## Problem

The platform cannot tell when a tenant has gone dark. Skinwise stopped receiving
WhatsApp webhooks around Jul 31 and nobody noticed for ~9 days — until the client
complained. A live check found **Skinwise and VMS both silent right now** (last inbound
Jul 31 / Aug 1), while healthy tenants (Razorveda, Umang, Fitness First) are active today.
The existing `health-monitor` cron is **platform-aggregate** (is the DB up? total message
count?) and **isn't even scheduled**; there is **no per-tenant silent detection** anywhere.
At 1,000+ tenants this guarantees silent, invisible failures.

## Goal

A daily watchdog that detects tenants who **were active but have gone silent**, records
per-tenant health state, surfaces it in the existing admin health UI, and emails platform
admins when a tenant newly goes dark — with a Meta probe so the alert says *why*.

## Decisions (from brainstorming)

1. **Detection = baseline-relative** (a tenant vs its own history), not a fixed
   "no inbound in X hours" threshold — so naturally-quiet small clients don't false-alarm.
2. **Alerts go to both** the existing admin health-reports UI (via `platform_health_reports`)
   **and** email to platform admins.
3. **Light Meta probe** for flagged tenants only — `GET /{phone_number_id}` with the tenant's
   token → token valid? number quality? — to make the alert actionable.

## Non-goals (YAGNI)

- Detection signal is inbound-silence only. The Meta probe explains *why* but is not itself a
  trigger. (Degraded-but-not-zero, quality drops, template rejections → future signals.)
- No new admin UI page — reuse the existing health-reports list.
- One email channel (`sendMail`). No Slack/SMS.
- No per-tenant threshold overrides. One global config.

## Detection (baseline-relative)

Named constants (tunable):
- `BASELINE_FROM = 16 days ago`, `BASELINE_TO = 2 days ago` (the baseline window).
- `MIN_BASELINE_INBOUND = 20` (established-tenant floor).
- `RECENT_HOURS = 48` (recent window).

A workspace is **silent** when ALL hold:
- `is_active = true`.
- `baseline_inbound_count >= MIN_BASELINE_INBOUND` (it was an established, active tenant).
- `recent_inbound_count == 0` over the last `RECENT_HOURS` (it has gone dark).

Otherwise **ok**. "Inbound" = `messages.direction = 'inbound'` joined via `conversations`
to the workspace. New/quiet tenants (no baseline) and tenants with any recent inbound are never
flagged.

## Data model

### New table `workspace_health` (one row per workspace)

```sql
CREATE TABLE public.workspace_health (
  workspace_id    UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'ok',   -- 'ok' | 'silent'
  last_inbound_at TIMESTAMPTZ,
  silent_since    TIMESTAMPTZ,                  -- set on ok→silent, kept while silent, cleared on recovery
  probe           JSONB DEFAULT '{}',           -- { token_ok, quality, display_phone_number, error }
  notified_at     TIMESTAMPTZ,                  -- when admins were emailed for the current silent spell
  recovered_at    TIMESTAMPTZ,                  -- last silent→ok transition
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: deny all to client roles (platform-admin/service only). Enable RLS, no permissive policy.
ALTER TABLE public.workspace_health ENABLE ROW LEVEL SECURITY;
```

The upsert each run is keyed on `workspace_id`; `silent_since` is preserved across runs while a
tenant stays silent (only set when transitioning ok→silent).

### Reuse `platform_health_reports`

Write one summary row per run: `overall_status` (`'error'` if any silent else `'ok'`),
`checks` (`{ type: 'tenant_health', silent_count, ok_count }`), `errors` (array of
`{ workspace, last_inbound_at, probe }` for silent tenants), `has_errors = silent_count > 0`.
The existing admin health-reports UI lists these and supports resolve — no new UI.

## The cron route — `POST /api/cron/tenant-health`

Auth: `Authorization: Bearer <CRON_SECRET>` (same guard as other cron routes).
`export const runtime = 'nodejs'; export const maxDuration = 60;`

Flow:
1. **Detect (one SQL query):** for every `is_active` workspace, compute `last_inbound_at`,
   `baseline_inbound_count`, `recent_inbound_count`; derive `status`.
2. **Load prior state:** read `workspace_health` for all workspaces into a map.
3. **Probe (bounded — only workspaces silent THIS run):** `GET https://graph.facebook.com/v19.0/{phone_number_id}?fields=verified_name,display_phone_number,quality_rating` with the tenant's `access_token`; capture `{ token_ok: res.ok, quality, display_phone_number, error }`. Wrap each in try/catch + a short timeout so one bad tenant can't fail the run.
4. **Upsert `workspace_health`** per workspace: set `status`, `last_inbound_at`, `probe` (for silent), manage `silent_since` (set on ok→silent, keep while silent, null on recovery), `recovered_at` on silent→ok, `updated_at`.
5. **Newly-silent set** = workspaces whose prior status was not `'silent'` (ok or no prior row) and whose new status is `'silent'`. Set their `notified_at = now()`.
6. **Summary row** into `platform_health_reports`.
7. **Email** (only if newly-silent is non-empty): to every `profiles.email` where `is_platform_admin = true`, via `sendMail` — subject like `⚠️ N tenant(s) went silent`, body listing each newly-silent tenant with `last_inbound_at` + probe verdict (e.g. "token OK, quality GREEN → webhook/delivery issue" vs "token invalid → renew").
8. Return `{ scanned, silent, newly_silent, recovered, emailed }` JSON.

Idempotency: re-running the same day re-detects the same silent set; because email is gated on
the ok→silent *transition* (prior status not silent), a second run the same day emails nothing.

## Scheduling

A daily `pg_cron` job `tenant-health-check` (`30 4 * * *` UTC ≈ 10:00 IST) that
`net.http_post`s the route with the **inlined** URL + `CRON_SECRET` (the `app.base_url` /
`app.cron_secret` settings aren't settable from the pooler here — same inlined pattern as the
`missed-reply-sweep` / `sla-breach-check` jobs). Migration also does the standard
`cron.unschedule(...) WHERE EXISTS ...` guard before scheduling.

## Testing

- **Unit (`tests/tenant-health.test.ts`):** pure classifier `classifyTenant({ is_active,
  baseline_count, recent_count }, cfg)` → `'ok' | 'silent'`: silent when active + baseline≥20 +
  recent=0; ok when inactive, when baseline<20 (not established), when recent>0. Boundary cases
  (baseline exactly 20; recent 0 vs 1). And `diffNewlySilent(prev, current)` → the set that
  transitioned to silent (ok→silent and no-prior→silent included; still-silent excluded;
  recovered excluded).
- **Live verify (scripted, controller):** run the detection SQL against prod and confirm it
  flags **Skinwise and VMS** and NOT Razorveda/Umang/Fitness First. Simulate the transition/
  recovery upsert in a rolled-back transaction to confirm `silent_since`/`recovered_at`/
  `notified_at` move correctly.
- **Cron migration:** apply, confirm `tenant-health-check` in `cron.job`.

## Rollout

- Adds a table + a cron route + a scheduled job. Requires a migration (workspace_health +
  cron) applied to the live DB, and a redeploy for the route. The migration is additive
  (new table, new cron) — no change to existing tables. The daily cron only reads message/
  workspace data + writes health rows + sends email; it never mutates tenant data.

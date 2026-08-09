# Per-Campaign Retention Lifecycle

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan

## Problem

Campaigns accumulate per-recipient data indefinitely. The platform has a workspace-level,
age-based retention (delete conversations/messages older than N months) but **no per-campaign
lifecycle**: a client can't see when a specific campaign's data expires, export it, or delete
just that campaign's records. The requirement is a per-campaign 2-month lifecycle with a
client-driven download/delete workflow and safe deletion.

## Key architectural facts (from audit)

- **Campaign data is isolated.** `campaign_id` exists only on `campaign_recipients` and
  `campaign_queue`. There is **no `campaign_id` on `messages`/`conversations`** — those are
  shared CRM data a campaign does not own. So deleting a campaign's data touches only its
  `campaign_recipients` + `campaign_queue` rows; **it never deletes CRM data** (inherently safe).
- Campaigns are low volume (≤ 28 per client). `campaign_status` enum: draft, scheduled,
  running, paused, completed, failed. `campaign_recipients` columns: `phone, name, status,
  sent_at, delivered_at, read_at, replied_at, reply_text, error_message, …`.
- Workspace admins = `workspace_members` with role in (`super_admin`, `admin`); notifications
  go via the `notifications` table (existing pattern).

## Decisions (from brainstorming)

1. **Retention clock:** `retention_at = COALESCE(completed_at, created_at) + interval '2 months'`.
2. **Post-expiry policy:** auto-detect + notify once; the **client decides** — the platform
   never auto-deletes campaign data.
3. **Download/Delete safety:** a combined **Download & Delete** exports first and deletes only
   on a successful download; a standalone **Delete** requires explicit confirmation; a standalone
   **Download** just exports. Never delete when an export was requested but failed.
4. **Deletion keeps the campaign row as a tombstone** — removes `campaign_recipients` +
   `campaign_queue`, preserves the campaign's aggregate stats (already stored on `campaigns`),
   sets `data_deleted_at`.

## Non-goals (YAGNI)

- No auto-delete. No deletion of conversations/messages (not campaign-owned). No new blob
  storage / background export jobs (the export streams directly, reusing `lib/export-stream.ts`).

## Retention status (pure)

`lib/campaign-retention.ts`:

```
type CampaignRetentionStatus = 'active' | 'expiring' | 'expired' | 'deleted';
computeRetention(
  campaign: { completed_at: string | null; created_at: string; data_deleted_at: string | null },
  now: Date,
): { retentionAt: string; status: CampaignRetentionStatus; daysRemaining: number }
```

- `retentionAt` = `COALESCE(completed_at, created_at)` + 2 months (ISO).
- `status`: `deleted` if `data_deleted_at` set; else `expired` if `now >= retentionAt`; else
  `expiring` if `now >= retentionAt - 7 days`; else `active`.
- `daysRemaining` = whole days from `now` to `retentionAt` (negative once expired), 0 when deleted.

## Data model

Migration adds three nullable columns to `public.campaigns`:
`retention_notified_at timestamptz`, `data_exported_at timestamptz`, `data_deleted_at timestamptz`.

It also adds a SECURITY DEFINER RPC for **atomic** deletion (a single plpgsql function runs in one
transaction, so a mid-way failure rolls back — no partial deletion):

```
delete_campaign_data(p_campaign_id uuid) RETURNS int  -- returns # recipients deleted
```

which deletes `campaign_queue` + `campaign_recipients` for the campaign and sets the campaign's
`data_deleted_at = now()`, all in one transaction. `REVOKE EXECUTE … FROM PUBLIC, anon,
authenticated` (called only by the admin/service client from the route).

## Detection + notification (cron)

A daily **pure-SQL** `pg_cron` job `campaign-retention-check` (no HTTP/email needed): for each
campaign where `COALESCE(completed_at, created_at) + interval '2 months' < now()` AND
`retention_notified_at IS NULL` AND `data_deleted_at IS NULL`, insert a `notifications` row
(`type = 'campaign_retention_due'`, title/body naming the campaign) for each `workspace_members`
admin (`super_admin`/`admin`) of the campaign's workspace, then set `retention_notified_at = now()`
so it fires once. Runs in the migration's cron section (unschedule-guard + schedule).

## API (per campaign)

All under `app/api/campaigns/[id]/retention/…`, auth `requireWorkspacePermission(workspaceId,
'create_campaigns')` (campaign owners), workspace-scoped by the campaign's `workspace_id`.

- **`GET /api/campaigns/[id]/retention`** → `{ status, retention_at, days_remaining,
  recipient_count, data_exported_at, data_deleted_at }` (recipient_count from a `campaign_recipients`
  head-count).
- **`GET /api/campaigns/[id]/retention/export`** → streams a CSV of the campaign's recipients
  (columns: Name, Phone, Status, Sent At, Delivered At, Read At, Replied At, Reply, Error) via
  `lib/export-stream.ts` (`paginateAll` + `streamingCsvResponse`, past the 1000 cap). Set
  `data_exported_at = now()` before streaming begins. Filename `campaign_<name>_<date>`. GET so the
  browser can trigger the download directly like the other export endpoints; auth via
  `requireWorkspacePermission`.
- **`POST /api/campaigns/[id]/retention/delete`** (body `{ confirmed: true }`) → if not
  `confirmed`, 400. Else call the `delete_campaign_data(id)` RPC (atomic). Idempotent (re-running
  when already deleted deletes 0 rows and re-stamps `data_deleted_at` harmlessly, returning ok).
  Returns `{ ok: true, deleted_recipients, data_deleted_at }`.

## UI (CampaignDetail)

A **Retention** section in `modules/campaigns/components/CampaignDetail`:
- Status badge (Active / Expiring in N days / Expired — action needed / Data deleted), the
  retention date, and recipient count (from the GET).
- Actions when not yet deleted: **Download** (hits export, triggers file download),
  **Download & Delete** (downloads the export, and only on a successful download calls the delete
  endpoint), **Delete** (confirmation dialog → delete endpoint with `confirmed:true`).
- When `data_deleted_at` is set: show "Data deleted on {date}" and hide the action buttons; the
  campaign's aggregate stats remain visible (unchanged, they live on the campaign row).

## Testing

- **Unit (`tests/campaign-retention.test.ts`):** `computeRetention` — `active` well before;
  `expiring` within 7 days of `retentionAt`; `expired` at/after `retentionAt`; `deleted` when
  `data_deleted_at` set (regardless of dates); uses `completed_at` when present else `created_at`;
  `daysRemaining` sign/boundaries.
- **Live verification (controller):** apply the migration; confirm the 3 columns + cron job;
  run the delete on a test campaign inside a rolled-back transaction and assert only
  `campaign_recipients`/`campaign_queue` rows for that campaign are removed and the campaign row +
  contacts/conversations survive; confirm the cron body notifies the one currently-due campaign.

## Rollout

- Additive migration (3 nullable columns + cron) applied live by the controller; code (routes +
  UI) requires redeploy. No existing table/behavior changed.

# Lead Export — Design Spec

**Date:** 2026-07-29
**Goal:** Bulk-export leads (all, or filtered by temperature hot/warm/cold) as CSV or Excel, from both the CRM Pipeline and the Conversations page — replacing one-lead-at-a-time downloads.

## Decisions (approved)
- A "lead" row = a `leads` (pipeline) row joined with its contact (name/phone/**temperature**) + assigned agent + last activity.
- Formats: **CSV and Excel (.xlsx)** (both already used in the codebase; `xlsx` is a dependency).
- Temperature lives on `contacts.temperature` (`hot|warm|cold`, trigger-maintained). Filter joins contacts.

## Components

### 1. `lib/lead-export.ts` (pure, testable)
- `LEAD_EXPORT_HEADERS: string[]` — column order.
- `leadToRow(lead): (string)[]` — maps one joined lead record to a row in header order (contact name, phone, temperature, stage, priority, source, value, currency, tags, assigned agent, follow-up, created, last activity).
- `parseTemperature(param: string | null): 'hot'|'warm'|'cold'|null` — validates the filter; unknown/`all`/null → `null` (no filter).
- `rowsToCsv(headers, rows): string` — the existing CSV-escape helper (copied from reports/export; keep DRY by exporting from here and having reports/export reuse it later — for v1 just include it here).

### 2. `app/api/leads/export/route.ts`
- `GET ?workspaceId=&format=csv|xlsx&temperature=all|hot|warm|cold`
- Auth: `requireWorkspacePermission(workspaceId, 'view_analytics')`.
- Query `leads` `!inner` join `contacts(name,phone,temperature)`, left join `profiles:assigned_agent_id(full_name,email)`, `conversations(last_message_at)`, `eq(workspace_id)`, and when a temperature is given `eq('contacts.temperature', temp)`; order by `created_at desc`, `limit(10000)`.
- Map via `leadToRow`. For `xlsx`: `XLSX.utils.json_to_sheet` (header row from `LEAD_EXPORT_HEADERS`) → workbook → buffer (mirror `conversations/export`). For `csv`: `rowsToCsv`.
- Filename: `leads_<temperature|all>_<YYYY-MM-DD>.{csv|xlsx}`; correct `Content-Type` per format.

### 3. `modules/crm/components/LeadExportMenu/index.tsx` (reusable)
- Dropdown "Export Leads" with a small **Excel ⇄ CSV** toggle and 4 actions: **All**, **Hot**, **Warm**, **Cold**.
- Each action downloads `/api/leads/export?workspaceId=&format=&temperature=` (anchor/`window.location` download; disabled while a download is in flight; `sonner` toast on trigger).
- Reads `workspaceId` from `useWorkspaceStore` (same as other components).

### 4. Mount points
- **CRM Pipeline** page header (the Kanban board toolbar).
- **Conversations** page header (next to the existing conversations export).

## Non-goals (YAGNI)
- No new columns on `leads`; no schema change.
- No async/background export (10k row cap is plenty; synchronous like the existing exports).
- No per-agent scoping in v1 (managers export; `view_analytics` gate). Add agent-scoping later if needed.

## Testing
- `tests/lead-export.test.ts`: `parseTemperature` (valid/`all`/unknown/null), `leadToRow` (field order + missing-contact fallbacks + tags join), `rowsToCsv` (escaping). Pure, no network.
- Verify endpoint against live data (counts per temperature match); `tsc` + `next build` clean.

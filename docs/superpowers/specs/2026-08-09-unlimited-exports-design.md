# Unlimited Exports — Fix the 1,000-row Cap + Stream Large Files

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan

## Problem

Every CSV/XLSX export silently truncates at ~1,000 rows. Proven root cause:
**PostgREST's `max-rows` setting (1000) caps every query the supabase-js client makes.**
A REST call `GET /rest/v1/leads?...&limit=10000` against Umang Hospital's 1,663 leads
returned exactly **1000 rows** with `Content-Range: 0-999/*`. So the `.limit(10000)` in
`leads/export` and `.limit(5000)` in `conversations`/`meta-leads` export are silently
ignored — clients lose data. Umang Hospital (1,663 leads, 1,636 conversations) is already
affected.

Secondary issue: all four export routes build the **entire file in memory** and return it
synchronously, so even after the cap is lifted, a 100k-row export would blow memory / time
out on the single Coolify container.

## Goal

All exports return the **complete filtered dataset** regardless of size, on the existing
stack (no queue/worker/blob-storage infra). Small exports keep the nice XLSX; large exports
stream as CSV so memory stays flat.

## Decisions (from brainstorming)

1. **Delivery:** streaming download (paginate past the cap; stream rows out) — not a
   background-job/blob-storage system (over-engineered for these volumes, infra doesn't exist).
2. **Format:** hybrid — count first; **≤ threshold rows → buffered XLSX**, **> threshold →
   streaming CSV**. Default threshold 5000 (configurable).
3. **Scope:** all four export endpoints — `leads`, `conversations`, `meta-leads`, `reports`.
4. **Shared engine:** one `lib/export-stream.ts` used by all four (DRY — the cap fix lives in
   one place), each endpoint a thin config (query + row mapper + headers).

## Non-goals (YAGNI)

- No background export jobs, job table, blob storage, signed URLs, or email links.
- No new export UI beyond wiring existing buttons to the new params (filters already largely
  exist in the current UIs).
- No change to the PostgREST `max-rows` server setting (we fix it in the app via pagination,
  which is portable and doesn't require Supabase project-level config the app can't guarantee).

## Root cause detail

`max-rows` caps **rows per request**. `.limit(N > 1000)` does not override it, and neither
does `.range(0, N)` — each request still returns at most `max-rows`. The only reliable way to
read all rows is to **page with `.range(offset, offset+pageSize-1)` in a loop**, `pageSize ≤
max-rows`, until a page returns fewer than `pageSize` rows.

## Architecture — shared engine `lib/export-stream.ts` (new)

Pure/streaming helpers, no endpoint knowledge:

- `csvCell(v: unknown): string` — RFC-4180 escaping: wrap in quotes, double internal quotes,
  null/undefined → empty.
- `csvLine(values: unknown[]): string` — join escaped cells with `,`, terminate with `\r\n`.
- `paginateAll<T>(makePageQuery: (offset: number, pageSize: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000): AsyncGenerator<T[]>` —
  loops: `offset = 0, pageSize, 2*pageSize, …`; on each iteration awaits `makePageQuery`,
  throws on `error`, yields `data` (if non-empty); stops when a page returns `< pageSize` rows
  (or empty). Guards against infinite loops with a hard page cap (e.g. 1000 pages = 1M rows)
  and logs if the cap is hit.
- `streamingCsvResponse<T>(headers: string[], pages: AsyncGenerator<T[]>, mapRow: (row: T) => unknown[], filename: string): Response` —
  builds a `ReadableStream` whose `start`/`pull` writes `csvLine(headers)` first, then
  `for await (const page of pages)` enqueues `csvLine(mapRow(row))` per row (encoded UTF-8,
  with a leading BOM for Excel). Returns a `Response` with `text/csv; charset=utf-8` +
  `Content-Disposition: attachment; filename="…"`.
- `bufferedXlsxResponse(headers: string[], rows: unknown[][], filename: string, sheetName: string): Response` —
  the existing in-memory `xlsx` build (aoa_to_sheet → workbook → buffer).
- `exportResponse<T>(opts: { count: number; threshold?: number; headers: string[]; pages: AsyncGenerator<T[]>; mapRow: (row: T) => unknown[]; filenameBase: string; sheetName: string }): Promise<Response>` —
  if `count ≤ (threshold ?? 5000)`: collect all pages into an array, build XLSX
  (`filenameBase.xlsx`); else: return `streamingCsvResponse` (`filenameBase.csv`). The count
  is computed by the caller (a `head: true, count: 'exact'` query on the same filter) so a
  query error surfaces as JSON **before** streaming starts.

**Query-builder note:** supabase query builders are single-use, so `makePageQuery` must
**construct a fresh query per call** (apply the same filters, then `.range(offset, offset +
pageSize - 1)`), not reuse one builder across pages.

## Endpoint changes (thin configs)

Each endpoint keeps its auth (`requireWorkspacePermission`) and `.eq('workspace_id', …)`, and
supplies: a count query, a `makePageQuery`, a `mapRow`, headers, and `filenameBase`.

1. **`leads/export`** — filters: `temperature` (all|hot|warm|cold, existing), `stage` (CRM
   pipeline), `assigned_agent`, `source`, `from`/`to` (created_at range). Same select/joins as
   today (contacts, assigned profile, conversations.last_message_at). Uses `exportResponse`.

2. **`conversations/export`** — add `?view=summary|history` (default `summary`, preserving
   today's behavior shape):
   - `summary`: one row per conversation (current Summary sheet columns). Hybrid via engine
     (count → XLSX ≤ threshold else streaming CSV).
   - `history`: one row per message, **always streaming CSV** (message histories are inherently
     large; no XLSX branch, so no message-count needed). Two-phase, both phases uncapped:
     (1) page through the matching conversation IDs with `paginateAll` (same date/status/channel
     + agent-role filter as summary) and collect them into an in-memory `string[]` of UUIDs —
     even the largest workspace is a few thousand IDs; (2) stream messages by iterating those IDs
     in batches of 200 and, within each batch, `paginateAll` over
     `messages.select(...).in('conversation_id', batchIds).order('created_at')`, mapping each
     message to a row (contact/agent/channel come from a `Map` built in phase 1). This preserves
     the current two-sheet export's "Full History" columns while removing its 5000-conversation
     cap. A tiny adapter wraps the batched phase-2 iteration as a single `AsyncGenerator<Message[]>`
     for `streamingCsvResponse`.

3. **`meta-leads/export`** — keep the `contains('labels', ['Meta Ad Lead'])` filter +
   from/to/status; platform filter stays a post-fetch JS filter (JSONB nested field). Switch to
   the engine for pagination. Keep the existing RLS server client + workspace scoping (its
   current auth model), just paginate.

4. **`reports/export`** — for each `type` (conversations|messages|contacts) + from/to range,
   paginate via the engine. Same columns as today.

## Tenant isolation (unchanged)

All four keep `.eq('workspace_id', workspaceId)` and their existing permission gate
(`view_analytics` / `handle_conversations`). Conversations keeps agent-role narrowing. The
engine never sees a workspace id — it only pages whatever filtered query it's handed, so it
cannot widen scope.

## Error handling

- Count query error or first-page error → return `500 JSON` before any stream bytes.
- Mid-stream error (after headers sent) → log with context and close the stream; the client
  receives a truncated CSV. Acceptable for CSV; documented. (No partial XLSX risk since XLSX is
  only used for small, fully-collected exports.)

## Testing

- **Unit (`tests/export-stream.test.ts`):**
  - `csvCell`/`csvLine`: escaping (quotes, commas, newlines, null/undefined), CRLF, BOM absent
    from cells.
  - `paginateAll`: mock `makePageQuery` returning e.g. [1000, 1000, 663] rows → generator
    yields all 2663 across 3 pages and stops (proves >1000 aggregation + partial-page stop);
    empty first page → yields nothing; error page → throws; page-cap guard trips at the limit.
  - `exportResponse`: `count = threshold` → XLSX; `count = threshold + 1` → CSV (boundary);
    correct filename extension + content-type per branch.
- **Live verification (scripted, manual):** call the leads export for Umang Hospital and assert
  the CSV/XLSX has **1,663 data rows, not 1,000**; call a `history` export for a high-volume
  workspace and confirm it streams (response starts before full read).

## Rollout

- Pure code change (no migration). Requires redeploy.
- Backward compatible: existing export buttons keep working; `conversations/export` defaults to
  `summary` so current callers are unaffected; new filters are optional query params.

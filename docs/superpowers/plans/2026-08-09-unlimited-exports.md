# Unlimited Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all four export endpoints return the complete filtered dataset (not just the first 1,000 rows), streaming large exports as CSV so memory stays flat.

**Architecture:** A shared `lib/export-stream.ts` engine pages past PostgREST's `max-rows` cap with `.range()`, streams CSV for large exports and buffers XLSX for small ones. Each of the four export routes becomes a thin config (filtered query + row mapper + headers) over the engine.

**Tech Stack:** Next.js 15 route handlers (Node runtime), TypeScript, Vitest, `xlsx`, Supabase JS (via `createAdminClient`).

## Global Constraints

- **Root cause:** PostgREST `max-rows` (1000) caps rows-per-request; `.limit(N>1000)` is ignored. Fix = page with `.range(offset, offset+pageSize-1)`, `pageSize=1000`, until a page returns `< pageSize`.
- **Format:** count first; `count <= threshold` → buffered XLSX; `count > threshold` → streaming CSV. Default `threshold = 5000`. An explicit `?format=csv` forces streaming CSV regardless of size.
- **Query builders are single-use:** the page-query factory MUST build a fresh query per call (re-apply filters, then `.range`), never reuse one builder.
- **Tenant isolation unchanged:** every query keeps `.eq('workspace_id', workspaceId)` and the route's existing `requireWorkspacePermission`; conversations keeps agent-role scoping (`ctx.role === 'agent'` → only their conversations).
- **CSV:** RFC-4180 escaping (wrap every cell in quotes, double internal quotes), `\r\n` line terminator, one leading UTF-8 BOM for Excel. `null`/`undefined` → empty cell.
- **filenameBase carries no extension** — the engine appends `.csv` / `.xlsx`.
- **Runtime:** these routes keep `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.
- Commit after each task with a Conventional Commit; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Export engine (`lib/export-stream.ts`)

**Files:**
- Create: `lib/export-stream.ts`
- Test: `tests/export-stream.test.ts`

**Interfaces:**
- Produces:
  - `csvCell(v: unknown): string`
  - `csvLine(values: unknown[]): string`
  - `type MakePageQuery<T> = (offset: number, pageSize: number) => PromiseLike<{ data: T[] | null; error: unknown }>`
  - `paginateAll<T>(makePageQuery: MakePageQuery<T>, pageSize?: number): AsyncGenerator<T[]>`
  - `streamingCsvResponse<T>(headers: string[], pages: AsyncGenerator<T[]>, mapRow: (row: T) => unknown[], filenameBase: string): Response`
  - `bufferedXlsxResponse(headers: string[], rows: unknown[][], filenameBase: string, sheetName: string): Response`
  - `exportResponse<T>(opts: { count: number; threshold?: number; forceCsv?: boolean; headers: string[]; pages: AsyncGenerator<T[]>; mapRow: (row: T) => unknown[]; filenameBase: string; sheetName: string }): Promise<Response>`

- [ ] **Step 1: Write the failing test**

Create `tests/export-stream.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { csvCell, csvLine, paginateAll, exportResponse, type MakePageQuery } from '../lib/export-stream';

describe('csvCell / csvLine', () => {
  it('escapes quotes, keeps commas/newlines, empties null', () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell('x,y')).toBe('"x,y"');
    expect(csvCell(42)).toBe('"42"');
  });
  it('joins cells and terminates with CRLF', () => {
    expect(csvLine(['a', 'b'])).toBe('"a","b"\r\n');
  });
});

function mockQuery(total: number): MakePageQuery<number> {
  return async (offset, pageSize) => {
    const end = Math.min(offset + pageSize, total);
    const data = offset >= total ? [] : Array.from({ length: end - offset }, (_, i) => offset + i);
    return { data, error: null };
  };
}
async function collect<T>(gen: AsyncGenerator<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const page of gen) out.push(...page);
  return out;
}

describe('paginateAll', () => {
  it('aggregates past 1000 across pages and stops on a partial page', async () => {
    const all = await collect(paginateAll(mockQuery(2663))); // 1000 + 1000 + 663
    expect(all.length).toBe(2663);
    expect(all[0]).toBe(0);
    expect(all[2662]).toBe(2662);
  });
  it('stops cleanly when the first page is empty', async () => {
    expect(await collect(paginateAll(mockQuery(0)))).toEqual([]);
  });
  it('stops when total is an exact multiple of pageSize', async () => {
    expect((await collect(paginateAll(mockQuery(2000)))).length).toBe(2000);
  });
  it('throws when a page returns an error', async () => {
    const bad: MakePageQuery<number> = async () => ({ data: null, error: new Error('boom') });
    await expect(collect(paginateAll(bad))).rejects.toThrow('boom');
  });
});

async function* onePage<T>(rows: T[]): AsyncGenerator<T[]> { yield rows; }

describe('exportResponse format selection', () => {
  const base = { headers: ['A'], mapRow: (n: number) => [n], filenameBase: 'f', sheetName: 'S' };
  it('count <= threshold → xlsx', async () => {
    const res = await exportResponse({ ...base, count: 5000, pages: onePage([1, 2]) });
    expect(res.headers.get('content-disposition')).toContain('f.xlsx');
    expect(res.headers.get('content-type')).toContain('spreadsheet');
  });
  it('count > threshold → csv', async () => {
    const res = await exportResponse({ ...base, count: 5001, pages: onePage([1, 2]) });
    expect(res.headers.get('content-disposition')).toContain('f.csv');
    expect(res.headers.get('content-type')).toContain('text/csv');
  });
  it('forceCsv streams csv even when small', async () => {
    const res = await exportResponse({ ...base, count: 1, forceCsv: true, pages: onePage([1]) });
    expect(res.headers.get('content-disposition')).toContain('f.csv');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/export-stream.test.ts`
Expected: FAIL — `Cannot find module '../lib/export-stream'`.

- [ ] **Step 3: Write the implementation**

Create `lib/export-stream.ts`:

```typescript
// lib/export-stream.ts — shared export engine.
// Pages past PostgREST's max-rows cap (1000/request), streams CSV for large
// exports, buffers XLSX for small ones. Endpoints supply the filtered query,
// a row mapper, and headers.
import * as XLSX from 'xlsx';

const DEFAULT_PAGE_SIZE = 1000;   // <= PostgREST max-rows
const MAX_PAGES = 1000;           // hard ceiling: 1000 * 1000 = 1M rows
const DEFAULT_THRESHOLD = 5000;   // <= this many rows → XLSX; more → streaming CSV

export function csvCell(v: unknown): string {
  if (v == null) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

export function csvLine(values: unknown[]): string {
  return values.map(csvCell).join(',') + '\r\n';
}

export type MakePageQuery<T> = (
  offset: number,
  pageSize: number,
) => PromiseLike<{ data: T[] | null; error: unknown }>;

export async function* paginateAll<T>(
  makePageQuery: MakePageQuery<T>,
  pageSize = DEFAULT_PAGE_SIZE,
): AsyncGenerator<T[]> {
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * pageSize;
    const { data, error } = await makePageQuery(offset, pageSize);
    if (error) {
      throw error instanceof Error
        ? error
        : new Error(String((error as { message?: unknown })?.message ?? error));
    }
    const rows = data ?? [];
    if (rows.length > 0) yield rows;
    if (rows.length < pageSize) return;
  }
  console.error('[export] paginateAll hit MAX_PAGES cap — export may be truncated');
}

export function streamingCsvResponse<T>(
  headers: string[],
  pages: AsyncGenerator<T[]>,
  mapRow: (row: T) => unknown[],
  filenameBase: string,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('﻿' + csvLine(headers))); // BOM + header
        for await (const page of pages) {
          let chunk = '';
          for (const row of page) chunk += csvLine(mapRow(row));
          if (chunk) controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        console.error('[export] stream error:', err);
        controller.error(err);
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

export function bufferedXlsxResponse(
  headers: string[],
  rows: unknown[][],
  filenameBase: string,
  sheetName: string,
): Response {
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}

export interface ExportOptions<T> {
  count: number;
  threshold?: number;
  forceCsv?: boolean;
  headers: string[];
  pages: AsyncGenerator<T[]>;
  mapRow: (row: T) => unknown[];
  filenameBase: string;
  sheetName: string;
}

export async function exportResponse<T>(opts: ExportOptions<T>): Promise<Response> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  if (!opts.forceCsv && opts.count <= threshold) {
    const rows: unknown[][] = [];
    for await (const page of opts.pages) {
      for (const row of page) rows.push(opts.mapRow(row));
    }
    return bufferedXlsxResponse(opts.headers, rows, opts.filenameBase, opts.sheetName);
  }
  return streamingCsvResponse(opts.headers, opts.pages, opts.mapRow, opts.filenameBase);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/export-stream.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/export-stream.ts tests/export-stream.test.ts
git commit -m "feat(export): shared streaming export engine (pagination past max-rows cap)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Leads export uses the engine + filters (`app/api/leads/export/route.ts`)

**Files:**
- Modify: `app/api/leads/export/route.ts` (full rewrite of the GET body)

**Interfaces:**
- Consumes: `paginateAll`, `exportResponse` from Task 1; existing `LEAD_EXPORT_HEADERS`, `leadToRow`, `parseTemperature`, `LeadRecord` from `@/lib/lead-export`.

- [ ] **Step 1: Rewrite the route**

Replace the entire contents of `app/api/leads/export/route.ts` with:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { LEAD_EXPORT_HEADERS, leadToRow, parseTemperature, type LeadRecord } from '@/lib/lead-export';
import { paginateAll, exportResponse } from '@/lib/export-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT = `
  temperature, stage, priority, source, value, currency, tags, follow_up_at, created_at,
  contacts(name, phone),
  profiles:assigned_agent_id(full_name, email),
  conversations(last_message_at)
`;

// GET /api/leads/export?workspaceId=&temperature=all|hot|warm|cold&stage=&assigned_agent=&source=&from=&to=&format=csv
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const temperature = parseTemperature(sp.get('temperature'));
    const stage = sp.get('stage');
    const assignedAgent = sp.get('assigned_agent');
    const source = sp.get('source');
    const from = sp.get('from');
    const to = sp.get('to');
    const forceCsv = sp.get('format') === 'csv';

    const applyFilters = (q: any) => {
      q = q.eq('workspace_id', workspaceId);
      if (temperature) q = q.eq('temperature', temperature);
      if (stage) q = q.eq('stage', stage);
      if (assignedAgent) q = q.eq('assigned_agent_id', assignedAgent);
      if (source) q = q.eq('source', source);
      if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
      if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
      return q;
    };

    const { count, error: countErr } = await applyFilters(
      db.from('leads').select('*', { count: 'exact', head: true }),
    );
    if (countErr) {
      console.error('[LeadExport count]', countErr);
      return NextResponse.json({ error: 'Failed to count leads' }, { status: 500 });
    }

    const pages = paginateAll<LeadRecord>((offset, pageSize) =>
      applyFilters(db.from('leads').select(SELECT))
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1),
    );

    const tag = temperature ?? 'all';
    const dateTag = new Date().toISOString().slice(0, 10);
    return await exportResponse<LeadRecord>({
      count: count ?? 0,
      forceCsv,
      headers: [...LEAD_EXPORT_HEADERS],
      pages,
      mapRow: (lead) => leadToRow(lead),
      filenameBase: `leads_${tag}_${dateTag}`,
      sheetName: 'Leads',
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[LeadExport GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/leads/export/route.ts
git commit -m "feat(export): leads export paginates past 1000-row cap + stage/agent/source/date filters

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

*(Live verification — that Umang Hospital's 1,663 leads all export — is run by the controller after the task, since it needs DB + network.)*

---

### Task 3: Conversations export — summary | history views (`app/api/conversations/export/route.ts`)

**Files:**
- Modify: `app/api/conversations/export/route.ts` (full rewrite)

**Interfaces:**
- Consumes: `paginateAll`, `exportResponse`, `streamingCsvResponse` from Task 1.

- [ ] **Step 1: Rewrite the route**

Replace the entire contents of `app/api/conversations/export/route.ts` with:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { paginateAll, exportResponse, streamingCsvResponse } from '@/lib/export-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function toIST(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

interface ConvRow {
  id: string;
  status: string | null;
  channel: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string | null;
  labels: string[] | null;
  bot_paused: boolean | null;
  contacts: { name?: string | null; phone?: string | null } | null;
  profiles: { full_name?: string | null; email?: string | null } | null;
}
interface MsgRow {
  conversation_id: string;
  direction: string | null;
  content: string | null;
  message_type: string | null;
  created_at: string | null;
  status: string | null;
}

const SUMMARY_HEADERS = [
  'Contact Name', 'Phone', 'Status', 'Channel', 'Last Message', 'Last Message At',
  'Assigned Agent', 'Labels', 'Bot Paused', 'Created At',
];
const HISTORY_HEADERS = [
  'Contact Name', 'Phone', 'Channel', 'Assigned Agent', 'Direction', 'Sender',
  'Message', 'Type', 'Status', 'Timestamp (IST)',
];

// GET /api/conversations/export?workspaceId=&view=summary|history&from=&to=&status=&channel=&format=csv
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const ctx = await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const view = sp.get('view') === 'history' ? 'history' : 'summary';
    const from = sp.get('from');
    const to = sp.get('to');
    const status = sp.get('status') ?? '';
    const channel = sp.get('channel') ?? '';
    const forceCsv = sp.get('format') === 'csv';
    const dateTag = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);

    const applyConvFilters = (q: any) => {
      q = q.eq('workspace_id', workspaceId);
      if (ctx.role === 'agent') q = q.eq('assigned_agent_id', ctx.userId);
      if (status) q = q.eq('status', status);
      if (channel) q = q.eq('channel', channel);
      if (from) q = q.gte('last_message_at', `${from}T00:00:00.000Z`);
      if (to) q = q.lte('last_message_at', `${to}T23:59:59.999Z`);
      return q;
    };

    // ── SUMMARY: one row per conversation, hybrid xlsx/csv ──────────────────────
    if (view === 'summary') {
      const { count, error: countErr } = await applyConvFilters(
        db.from('conversations').select('*', { count: 'exact', head: true }),
      );
      if (countErr) {
        console.error('[ConvExport count]', countErr);
        return NextResponse.json({ error: 'Failed to count conversations' }, { status: 500 });
      }
      const pages = paginateAll<ConvRow>((offset, pageSize) =>
        applyConvFilters(db.from('conversations').select(`
          id, status, channel, last_message, last_message_at, created_at, labels, bot_paused,
          contacts(name, phone), profiles:assigned_agent_id(full_name, email)
        `))
          .order('last_message_at', { ascending: false })
          .range(offset, offset + pageSize - 1),
      );
      return await exportResponse<ConvRow>({
        count: count ?? 0,
        forceCsv,
        headers: SUMMARY_HEADERS,
        pages,
        mapRow: (c) => [
          c.contacts?.name ?? '', c.contacts?.phone ?? '', c.status ?? '', c.channel ?? '',
          c.last_message ?? '', toIST(c.last_message_at),
          c.profiles?.full_name ?? c.profiles?.email ?? 'Unassigned',
          Array.isArray(c.labels) ? c.labels.join(', ') : '', c.bot_paused ? 'Yes' : 'No',
          toIST(c.created_at),
        ],
        filenameBase: `conversations_summary_${dateTag}`,
        sheetName: 'Summary',
      });
    }

    // ── HISTORY: one row per message, always streaming CSV ──────────────────────
    // Phase 1: page all matching conversation IDs (uncapped) + build a meta lookup.
    const meta = new Map<string, { name: string; phone: string; agent: string; channel: string }>();
    for await (const page of paginateAll<ConvRow>((offset, pageSize) =>
      applyConvFilters(db.from('conversations').select(`
        id, channel, contacts(name, phone), profiles:assigned_agent_id(full_name, email)
      `))
        .order('last_message_at', { ascending: false })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const c of page) {
        meta.set(c.id, {
          name: c.contacts?.name ?? '',
          phone: c.contacts?.phone ?? '',
          agent: c.profiles?.full_name ?? c.profiles?.email ?? 'Unassigned',
          channel: c.channel ?? '',
        });
      }
    }
    const convIds = [...meta.keys()];

    // Phase 2: stream messages for those conversations, batched by 200 ids.
    async function* historyPages(): AsyncGenerator<MsgRow[]> {
      const BATCH = 200;
      for (let i = 0; i < convIds.length; i += BATCH) {
        const batch = convIds.slice(i, i + BATCH);
        yield* paginateAll<MsgRow>((offset, pageSize) =>
          db.from('messages')
            .select('conversation_id, direction, content, message_type, created_at, status')
            .eq('workspace_id', workspaceId)
            .in('conversation_id', batch)
            .order('created_at', { ascending: true })
            .range(offset, offset + pageSize - 1),
        );
      }
    }

    return streamingCsvResponse<MsgRow>(
      HISTORY_HEADERS,
      historyPages(),
      (m) => {
        const md = meta.get(m.conversation_id);
        return [
          md?.name ?? '', md?.phone ?? '', md?.channel ?? '', md?.agent ?? 'Unassigned',
          m.direction ?? '',
          m.direction === 'inbound' ? (md?.name ?? md?.phone ?? '') : 'Agent / Bot',
          m.content ?? '', m.message_type ?? 'text', m.status ?? '', toIST(m.created_at),
        ];
      },
      `conversations_history_${dateTag}`,
    );
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Conversations Export]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/conversations/export/route.ts
git commit -m "feat(export): conversations export summary|history views, uncapped + streaming

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

*(Note: the endpoint now returns a single-sheet summary by default, or full message history via `?view=history`, replacing the old 2-sheet workbook. Existing callers with no `view` param get the summary. Wiring a "Full History" button in the UI is a separate follow-up, out of scope here.)*

---

### Task 4: Meta-leads + Reports exports use the engine

**Files:**
- Modify: `app/api/meta-leads/export/route.ts` (full rewrite)
- Modify: `app/api/reports/export/route.ts` (paginate each `type` branch)

**Interfaces:**
- Consumes: `paginateAll`, `streamingCsvResponse` from Task 1. (`meta-leads` always streams CSV — it already produced CSV; `reports` already produces CSV, keep CSV.)

- [ ] **Step 1: Rewrite `meta-leads/export`**

Replace the entire contents of `app/api/meta-leads/export/route.ts` with:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { paginateAll, streamingCsvResponse } from '@/lib/export-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface MetaConv {
  id: string;
  status: string | null;
  created_at: string | null;
  meta: { ad_source?: { platform?: string; headline?: string; body?: string; ad_id?: string; source?: string } } | null;
  contact: { name?: string | null; phone?: string | null } | null;
  messages: Array<{ content?: string | null; direction?: string | null; created_at?: string | null }> | null;
}

const HEADERS = [
  'Name', 'Phone', 'Platform', 'Ad Headline', 'Ad Body', 'Ad ID', 'Source',
  'First Message', 'Conversation Date', 'Status',
];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await (supabase as any)
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).single();
  if (!member?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const workspaceId: string = member.workspace_id;
  const sp = new URL(req.url).searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const platform = sp.get('platform');
  const status = sp.get('status');

  const applyFilters = (q: any) => {
    q = q.eq('workspace_id', workspaceId).contains('labels', ['Meta Ad Lead']);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to + 'T23:59:59Z');
    if (status) q = q.eq('status', status);
    return q;
  };

  // Platform lives in a nested JSONB field not filterable via PostgREST — filter per page in JS.
  async function* pages(): AsyncGenerator<MetaConv[]> {
    for await (const page of paginateAll<MetaConv>((offset, pageSize) =>
      applyFilters(supabase.from('conversations').select(`
        id, status, created_at, meta,
        contact:contacts!contact_id(name, phone),
        messages(content, direction, created_at)
      `))
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1),
    )) {
      yield platform
        ? page.filter((r) => (r.meta?.ad_source?.platform ?? 'facebook') === platform)
        : page;
    }
  }

  const dateTag = new Date().toISOString().slice(0, 10);
  const parts = ['meta-leads', dateTag];
  if (platform) parts.push(platform);
  if (status) parts.push(status);

  return streamingCsvResponse<MetaConv>(HEADERS, pages(), (row) => {
    const ad = row.meta?.ad_source ?? {};
    const firstMsg = (row.messages ?? [])
      .filter((m) => m.direction === 'inbound')
      .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())[0];
    return [
      row.contact?.name ?? '', row.contact?.phone ?? '', ad.platform ?? 'facebook',
      ad.headline ?? '', ad.body ?? '', ad.ad_id ?? '', ad.source ?? '',
      firstMsg?.content ?? '', row.created_at?.slice(0, 10) ?? '', row.status ?? '',
    ];
  }, parts.join('_'));
}
```

- [ ] **Step 2: Update `reports/export` to paginate each type**

In `app/api/reports/export/route.ts`, add at the top (after imports):

```typescript
import { paginateAll } from '@/lib/export-stream';
```

For EACH of the three `type` branches (`conversations`, `messages`, `contacts`), replace the single `await (supabase as any).from(...).select(...)...` fetch with a paginated collect that re-applies the same filters per page. The pattern for each branch (using the `conversations` branch as the concrete example — apply the identical transform to `messages` and `contacts`, keeping each branch's own select string, `.eq`/`.gte`/`.lte` filters, and ordering):

```typescript
    if (type === 'conversations') {
      const SELECT = 'id, status, channel, sentiment, last_message, last_message_at, created_at, resolved_at, labels, contacts(name, phone, temperature), assigned_agent:workspace_members!conversations_assigned_agent_id_fkey(user_id)';
      const data: any[] = [];
      for await (const page of paginateAll<any>((offset, pageSize) =>
        (supabase as any).from('conversations').select(SELECT)
          .eq('workspace_id', workspaceId)
          .gte('created_at', from).lte('created_at', `${to}T23:59:59Z`)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1),
      )) data.push(...page);
      // ... existing row-mapping / csvContent build using `data` stays unchanged ...
    }
```

Keep the existing CSV building (`toCSV(...)`) and response exactly as they are — only the data-fetch is swapped for the paginated loop. Read the current filters/ordering in each branch and reproduce them verbatim inside the `makePageQuery` closure. Do not change columns or output.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/meta-leads/export/route.ts app/api/reports/export/route.ts
git commit -m "feat(export): meta-leads + reports exports paginate past 1000-row cap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation (controller-run)

- Full build + suite: `npx tsc --noEmit && npx vitest run && npx next build`.
- **Live verification (scripted, needs DB + a valid session):** hit `/api/leads/export?workspaceId=<Umang>` and assert the file has **1,663 data rows** (not 1,000); hit `?view=history` for a high-volume workspace and confirm the response streams. If a session is hard to obtain, verify the pagination against the REST API directly (loop `.range()` and confirm >1000 rows returned).
- Push to `origin/main`, then tell the user to redeploy (code change).

## Self-review notes (coverage vs spec)

- Root-cause fix (pagination past cap) → Task 1 `paginateAll`, applied in Tasks 2–4.
- Streaming CSV / buffered XLSX / hybrid by count → Task 1 (`streamingCsvResponse`, `bufferedXlsxResponse`, `exportResponse`); threshold 5000 + `forceCsv` honored.
- Leads filters (temperature/stage/agent/source/date) → Task 2.
- Conversations summary|history, history two-phase + always-stream → Task 3.
- meta-leads + reports uncapped → Task 4.
- Tenant isolation + agent-role scoping preserved → Tasks 2–4 keep `.eq(workspace_id)` + `requireWorkspacePermission` + agent narrowing.
- Tests (csv escaping, paginateAll >1000 + partial-stop + error, format selection boundary) → Task 1.

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
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
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

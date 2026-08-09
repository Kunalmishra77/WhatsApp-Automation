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

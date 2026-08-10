// lib/meta-spend-load.ts — shared uncapped loader for meta_spend_daily reads.
// PostgREST caps .select() at 1000 rows; read routes must page through
// paginateAll to avoid undercounting totals for workspaces with more history.
import { paginateAll } from '@/lib/export-stream';
import type { SpendRow, AdminSpendRow } from '@/lib/meta-spend';

export async function loadSpendRows(db: any, workspaceId: string): Promise<SpendRow[]> {
  const out: SpendRow[] = [];
  for await (const page of paginateAll<SpendRow>((offset, pageSize) =>
    db.from('meta_spend_daily').select('day, category, volume, cost, currency')
      .eq('workspace_id', workspaceId).order('day', { ascending: true }).order('category', { ascending: true })
      .range(offset, offset + pageSize - 1),
  )) {
    // Coerce numeric(14,4) cost/volume defensively: if a driver ever serializes
    // numeric as a string, `total += r.cost` must stay arithmetic, not concat.
    for (const r of page) out.push({ ...r, cost: Number(r.cost), volume: Number(r.volume) });
  }
  return out;
}

// Cross-workspace read for the platform-admin view. Filtered by day range
// (not workspace) — pages past PostgREST's 1000-row cap so platform totals
// never undercount for ranges/tenant-counts that exceed one page.
export async function loadSpendRowsAdmin(db: any, from: string, to: string): Promise<AdminSpendRow[]> {
  const out: AdminSpendRow[] = [];
  for await (const page of paginateAll<AdminSpendRow>((offset, pageSize) =>
    db.from('meta_spend_daily').select('workspace_id, day, cost, currency')
      .gte('day', from).lte('day', to)
      .order('day', { ascending: true }).order('workspace_id', { ascending: true })
      .range(offset, offset + pageSize - 1),
  )) {
    for (const r of page) out.push({ ...r, cost: Number(r.cost) });
  }
  return out;
}

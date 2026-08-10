// lib/meta-spend-sync.ts — fetch Meta pricing_analytics and upsert meta_spend_daily.
import { parsePricingAnalytics } from '@/lib/meta-spend';

const GRAPH = 'https://graph.facebook.com/v19.0';

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally { clearTimeout(t); }
}

export async function syncWorkspaceSpend(
  db: any,
  workspace: { id: string; waba_id: string | null; access_token: string | null },
  days = 35,
): Promise<{ rows: number; error?: string }> {
  const rangeEnd = new Date();
  const rangeStart = new Date(Date.now() - days * 86400_000);
  let error: string | undefined;
  let rowsUpserted = 0;
  try {
    if (!workspace.waba_id || !workspace.access_token) throw new Error('missing waba_id or token');
    const token = workspace.access_token.replace(/﻿/g, '').trim();

    // currency (+ timezone) from the WABA node
    const meta = await fetchJson(`${GRAPH}/${workspace.waba_id}?fields=currency,timezone_id&access_token=${encodeURIComponent(token)}`);
    const currency: string = meta.ok ? (meta.body?.currency ?? '') : '';

    // pricing_analytics: daily, by category
    const start = Math.floor(rangeStart.getTime() / 1000);
    const end = Math.floor(rangeEnd.getTime() / 1000);
    const params = new URLSearchParams({ start: String(start), end: String(end), granularity: 'DAILY', dimensions: '["PRICING_CATEGORY"]', access_token: token });
    const pa = await fetchJson(`${GRAPH}/${workspace.waba_id}/pricing_analytics?${params}`);
    if (!pa.ok) throw new Error(`pricing_analytics ${pa.status}: ${String(pa.body?.error?.message ?? '').slice(0, 120)}`);

    const rows = parsePricingAnalytics(pa.body, currency);
    if (rows.length) {
      const payload = rows.map((r) => ({
        workspace_id: workspace.id, waba_id: workspace.waba_id, day: r.day, category: r.category,
        volume: r.volume, cost: r.cost, currency: r.currency, synced_at: new Date().toISOString(),
      }));
      const { error: upErr } = await db.from('meta_spend_daily').upsert(payload, { onConflict: 'workspace_id,day,category' });
      if (upErr) throw new Error(`upsert: ${upErr.message}`);
      rowsUpserted = payload.length;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await db.from('meta_spend_sync').insert({
    workspace_id: workspace.id,
    range_start: rangeStart.toISOString().slice(0, 10),
    range_end: rangeEnd.toISOString().slice(0, 10),
    rows_upserted: rowsUpserted, status: error ? 'error' : 'ok', error: error ?? null,
  });
  return { rows: rowsUpserted, error };
}

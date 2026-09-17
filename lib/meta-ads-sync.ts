// lib/meta-ads-sync.ts
// Pull real Facebook/Instagram AD spend from the Meta Marketing API into
// meta_ad_spend_daily. Per-workspace ad account + token. Fail-soft.

const GRAPH = 'https://graph.facebook.com/v19.0';

export interface MetaAdsSyncResult { ok: boolean; rows: number; spend: number; error?: string }

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Resolve the workspace's Meta ad account id + a token that can read ads.
export async function getMetaAdsConfig(
  db: any, workspaceId: string,
): Promise<{ adAccountId: string; token: string } | null> {
  const { data: ws } = await db
    .from('workspaces')
    .select('access_token, settings')
    .eq('id', workspaceId)
    .single();
  const settings = (ws?.settings ?? {}) as Record<string, unknown>;
  const rawId = (settings.meta_ad_account_id as string | undefined)?.trim();
  if (!rawId) return null;
  const adAccountId = rawId.replace(/^act_/, '');
  // A dedicated ads token wins; else fall back to the WhatsApp token (which must
  // carry ads_read for this to work).
  const token = ((settings.meta_ads_token as string | undefined)?.trim())
    || (ws?.access_token ? String(ws.access_token).replace(/﻿/g, '').trim() : '');
  if (!adAccountId || !token) return null;
  return { adAccountId, token };
}

export async function syncWorkspaceMetaAds(db: any, workspaceId: string): Promise<MetaAdsSyncResult> {
  const result: MetaAdsSyncResult = { ok: false, rows: 0, spend: 0 };
  try {
    const cfg = await getMetaAdsConfig(db, workspaceId);
    if (!cfg) { result.error = 'not_configured'; return result; }

    const until = new Date();
    const since = new Date(Date.now() - 30 * 86_400_000);
    const params = new URLSearchParams({
      level: 'campaign',
      fields: 'campaign_id,campaign_name,spend,impressions,clicks',
      time_increment: '1',
      time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
      limit: '500',
      access_token: cfg.token,
    });

    // Account currency (best-effort).
    let currency = 'INR';
    try {
      const accRes = await fetch(`${GRAPH}/act_${cfg.adAccountId}?fields=currency&access_token=${encodeURIComponent(cfg.token)}`);
      if (accRes.ok) { const a = await accRes.json() as { currency?: string }; if (a.currency) currency = a.currency; }
    } catch { /* ignore */ }

    const rows: Array<{ workspace_id: string; ad_account_id: string; date: string; campaign_id: string; campaign_name: string; spend: number; impressions: number; clicks: number; currency: string }> = [];
    let url: string | null = `${GRAPH}/act_${cfg.adAccountId}/insights?${params.toString()}`;
    let guard = 0;
    while (url && guard < 20) {
      guard++;
      const res = await fetch(url);
      if (!res.ok) {
        result.error = `insights ${res.status}: ${await res.text()}`;
        return result;
      }
      const json = await res.json() as { data?: Array<Record<string, string>>; paging?: { next?: string } };
      for (const r of json.data ?? []) {
        rows.push({
          workspace_id: workspaceId,
          ad_account_id: cfg.adAccountId,
          date: r.date_start ?? ymd(until),
          campaign_id: r.campaign_id ?? 'unknown',
          campaign_name: r.campaign_name ?? null as unknown as string,
          spend: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          currency,
        });
      }
      url = json.paging?.next ?? null;
    }

    if (rows.length > 0) {
      await db.from('meta_ad_spend_daily').upsert(rows, { onConflict: 'workspace_id,date,campaign_id' });
    }
    result.ok = true;
    result.rows = rows.length;
    result.spend = rows.reduce((s, r) => s + r.spend, 0);
    return result;
  } catch (err) {
    console.error('[MetaAds sync]', err);
    result.error = err instanceof Error ? err.message : 'sync_failed';
    return result;
  }
}

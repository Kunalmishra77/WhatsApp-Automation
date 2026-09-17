// lib/google-ads-sync.ts
// Phase 4 Part B — pull a workspace's Google Ads campaign metrics (last 30 days)
// and cache them in google_ads_campaigns. Fail-soft.

import { refreshAccessToken, searchGaql, listAccessibleCustomers } from '@/lib/google-ads';

export interface AdsSyncResult { ok: boolean; campaigns: number; rows: number; error?: string }

const CAMPAIGN_GAQL = `
  SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
         segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
  FROM campaign
  WHERE segments.date DURING LAST_30_DAYS
`;

export async function getWorkspaceAdsAuth(
  db: any, workspaceId: string,
): Promise<{ accessToken: string; customerId: string; loginCustomerId: string | null } | null> {
  const { data: conn } = await db
    .from('google_ads_connections')
    .select('refresh_token, customer_id, login_customer_id')
    .eq('workspace_id', workspaceId)
    .single();
  if (!conn?.refresh_token) return null;
  const accessToken = await refreshAccessToken(conn.refresh_token);
  if (!accessToken) return null;

  // Resolve the customer id on first use (needs the developer token).
  let customerId = conn.customer_id as string | null;
  if (!customerId) {
    const accts = await listAccessibleCustomers(accessToken);
    if (accts.ok) customerId = accts.data[0] ?? null;
    if (customerId) await db.from('google_ads_connections').update({ customer_id: customerId }).eq('workspace_id', workspaceId);
  }
  if (!customerId) return null;

  return { accessToken, customerId, loginCustomerId: conn.login_customer_id ?? null };
}

export async function syncWorkspaceAds(db: any, workspaceId: string): Promise<AdsSyncResult> {
  const result: AdsSyncResult = { ok: false, campaigns: 0, rows: 0 };
  try {
    const auth = await getWorkspaceAdsAuth(db, workspaceId);
    if (!auth) { result.error = 'not_connected'; return result; }

    const res = await searchGaql(auth.accessToken, auth.customerId, CAMPAIGN_GAQL, auth.loginCustomerId);
    if (!res.ok) {
      await db.from('google_ads_connections').update({ status: 'error' }).eq('workspace_id', workspaceId);
      result.error = res.error;
      return result;
    }

    const seen = new Set<string>();
    const rows = res.data.map((r) => {
      const campaignId = String(r.campaign?.id ?? '');
      seen.add(campaignId);
      return {
        workspace_id: workspaceId,
        customer_id: auth.customerId,
        campaign_id: campaignId,
        name: r.campaign?.name ?? null,
        status: r.campaign?.status ?? null,
        channel_type: r.campaign?.advertisingChannelType ?? null,
        date: r.segments?.date ?? null,
        cost_micros: Number(r.metrics?.costMicros ?? 0),
        clicks: Number(r.metrics?.clicks ?? 0),
        impressions: Number(r.metrics?.impressions ?? 0),
        conversions: Number(r.metrics?.conversions ?? 0),
        raw: r,
      };
    }).filter((r) => r.campaign_id && r.date);

    if (rows.length > 0) {
      await db.from('google_ads_campaigns').upsert(rows, { onConflict: 'workspace_id,campaign_id,date' });
    }

    await db.from('google_ads_connections')
      .update({ last_synced_at: new Date().toISOString(), status: 'connected' })
      .eq('workspace_id', workspaceId);

    result.ok = true;
    result.campaigns = seen.size;
    result.rows = rows.length;
    return result;
  } catch (err) {
    console.error('[GoogleAds sync] error:', err);
    result.error = err instanceof Error ? err.message : 'sync_failed';
    return result;
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { syncWorkspaceGbp } from '@/lib/gbp-sync';
import { syncWorkspaceAds } from '@/lib/google-ads-sync';
import { syncWorkspaceMetaAds } from '@/lib/meta-ads-sync';
import { runWorkspaceRankCheck } from '@/lib/local-rank';

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST /api/cron/google-sync — refresh GBP (reviews/Q&A/insights), Google Ads
// (campaign metrics) and Meta ad spend for every connected workspace.
// Bearer CRON_SECRET guarded.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;
  const result = {
    gbp: { synced: 0, failed: 0 },
    ads: { synced: 0, failed: 0 },
    meta_ads: { synced: 0, failed: 0 },
    local_rank: { workspaces: 0, keywords: 0 },
  };

  // GBP connections
  const { data: gbpConns } = await db
    .from('gbp_connections')
    .select('workspace_id')
    .eq('status', 'connected');
  for (const c of (gbpConns ?? []) as Array<{ workspace_id: string }>) {
    const r = await syncWorkspaceGbp(db, c.workspace_id);
    if (r.ok) result.gbp.synced++; else result.gbp.failed++;
  }

  // Google Ads connections
  const { data: adsConns } = await db
    .from('google_ads_connections')
    .select('workspace_id')
    .eq('status', 'connected');
  for (const c of (adsConns ?? []) as Array<{ workspace_id: string }>) {
    const r = await syncWorkspaceAds(db, c.workspace_id);
    if (r.ok) result.ads.synced++; else result.ads.failed++;
  }

  // Meta ad spend — workspaces that configured a Meta ad account id.
  const { data: metaWs } = await db
    .from('workspaces')
    .select('id')
    .eq('is_active', true)
    .not('settings->>meta_ad_account_id', 'is', null);
  for (const w of (metaWs ?? []) as Array<{ id: string }>) {
    const r = await syncWorkspaceMetaAds(db, w.id);
    if (r.ok) result.meta_ads.synced++; else result.meta_ads.failed++;
  }

  // Local rank tracker — refresh ranks for every workspace with tracked keywords.
  if (process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    const { data: rankRows } = await db
      .from('local_rank_keywords')
      .select('workspace_id');
    const rankWsIds = [...new Set(((rankRows ?? []) as Array<{ workspace_id: string }>).map((r) => r.workspace_id))];
    for (const wsId of rankWsIds) {
      try {
        const r = await runWorkspaceRankCheck(db, wsId);
        result.local_rank.workspaces++;
        result.local_rank.keywords += r.checked;
      } catch (err) {
        console.error('[cron google-sync] local-rank failed for', wsId, err);
      }
    }
  }

  return NextResponse.json(result);
}

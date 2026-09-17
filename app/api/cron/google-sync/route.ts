import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { syncWorkspaceGbp } from '@/lib/gbp-sync';
import { syncWorkspaceAds } from '@/lib/google-ads-sync';
import { syncWorkspaceMetaAds } from '@/lib/meta-ads-sync';

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
  const result = { gbp: { synced: 0, failed: 0 }, ads: { synced: 0, failed: 0 }, meta_ads: { synced: 0, failed: 0 } };

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

  return NextResponse.json(result);
}

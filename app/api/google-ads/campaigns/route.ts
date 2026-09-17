import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { microsToCurrency } from '@/lib/google-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/google-ads/campaigns?workspaceId=&from=&to=
// Aggregates cached daily campaign metrics into per-campaign totals + overall KPIs.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const from = sp.get('from');
    const to = sp.get('to');

    let q = db.from('google_ads_campaigns')
      .select('campaign_id, name, status, channel_type, cost_micros, clicks, impressions, conversions')
      .eq('workspace_id', workspaceId);
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);

    const { data, error } = await q.limit(5000);
    if (error) return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });

    const rows = (data ?? []) as Array<{ campaign_id: string; name: string | null; status: string | null; channel_type: string | null; cost_micros: number; clicks: number; impressions: number; conversions: number }>;
    const map = new Map<string, { campaign_id: string; name: string | null; status: string | null; channel_type: string | null; cost: number; clicks: number; impressions: number; conversions: number }>();
    for (const r of rows) {
      const c = map.get(r.campaign_id) ?? { campaign_id: r.campaign_id, name: r.name, status: r.status, channel_type: r.channel_type, cost: 0, clicks: 0, impressions: 0, conversions: 0 };
      c.cost += microsToCurrency(r.cost_micros);
      c.clicks += Number(r.clicks);
      c.impressions += Number(r.impressions);
      c.conversions += Number(r.conversions);
      map.set(r.campaign_id, c);
    }
    const campaigns = [...map.values()].sort((a, b) => b.cost - a.cost);
    const totals = campaigns.reduce((t, c) => ({
      cost: t.cost + c.cost, clicks: t.clicks + c.clicks,
      impressions: t.impressions + c.impressions, conversions: t.conversions + c.conversions,
    }), { cost: 0, clicks: 0, impressions: 0, conversions: 0 });

    return NextResponse.json({ campaigns, totals });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/gbp/insights?workspaceId=&locationId=&from=&to=
// Returns per-metric totals + a daily time series over the range.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const locationId = sp.get('locationId');
    const from = sp.get('from');
    const to = sp.get('to');

    let q = db.from('gbp_insights_daily')
      .select('date, metric, value')
      .eq('workspace_id', workspaceId);
    if (locationId && locationId !== 'all') q = q.eq('location_id', locationId);
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);

    const { data, error } = await q.order('date', { ascending: true }).limit(5000);
    if (error) return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 });

    const rows = (data ?? []) as Array<{ date: string; metric: string; value: number }>;
    const totals: Record<string, number> = {};
    const seriesMap = new Map<string, Record<string, number>>(); // date -> {metric: sum}
    for (const r of rows) {
      totals[r.metric] = (totals[r.metric] ?? 0) + Number(r.value);
      const day = seriesMap.get(r.date) ?? {};
      day[r.metric] = (day[r.metric] ?? 0) + Number(r.value);
      seriesMap.set(r.date, day);
    }
    const series = [...seriesMap.entries()]
      .map(([date, metrics]) => ({ date, ...metrics }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ totals, series });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

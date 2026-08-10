import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, bucketSeries } from '@/lib/meta-spend';
import { loadSpendRows } from '@/lib/meta-spend-load';

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');
    const db = createAdminClient() as any;
    const now = new Date();
    const period = sp.get('from') && sp.get('to')
      ? { from: sp.get('from')!, to: sp.get('to')! }
      : resolveRange(sp.get('range') ?? 'last_30_days', now);

    // Load ALL rows via paginateAll (past the 1000-row cap).
    const rows = await loadSpendRows(db, workspaceId);
    const currency = rows[0]?.currency ?? '';
    const bucket = (sp.get('bucket') as 'day' | 'week' | 'month') ?? 'day';

    return NextResponse.json({ series: bucketSeries(rows, period.from, period.to, bucket), currency });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[MetaSpend series]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

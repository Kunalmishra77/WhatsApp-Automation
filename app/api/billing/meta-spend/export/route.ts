import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, type SpendRow } from '@/lib/meta-spend';
import { paginateAll, streamingCsvResponse } from '@/lib/export-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const headers = ['Date', 'Category', 'Messages', 'Cost', 'Currency'];
    const pages = paginateAll<SpendRow>((offset, pageSize) =>
      db.from('meta_spend_daily').select('day,category,volume,cost,currency')
        .eq('workspace_id', workspaceId)
        .gte('day', period.from).lte('day', period.to)
        .order('day', { ascending: true }).order('category', { ascending: true })
        .range(offset, offset + pageSize - 1),
    );

    return streamingCsvResponse<SpendRow>(
      headers, pages,
      (r) => [r.day, r.category, r.volume, r.cost, r.currency],
      `meta_spend_${period.from}_${period.to}`,
    );
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[MetaSpend export]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

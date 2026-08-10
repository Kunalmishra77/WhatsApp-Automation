import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange } from '@/lib/meta-spend';
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

    const filtered = rows
      .filter((r) => r.day >= period.from && r.day <= period.to)
      .sort((a, b) => (a.day === b.day ? a.category.localeCompare(b.category) : b.day.localeCompare(a.day)))
      .map((r) => ({ day: r.day, category: r.category, volume: r.volume, cost: r.cost }));

    return NextResponse.json({ rows: filtered, currency });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[MetaSpend history]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

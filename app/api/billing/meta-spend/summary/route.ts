import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, sumCost, pctChange } from '@/lib/meta-spend';
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

    // Load ALL rows via paginateAll (past the 1000-row cap) — see loadSpendRows in the shared pattern.
    const rows = await loadSpendRows(db, workspaceId);
    const currency = rows[0]?.currency ?? '';

    const today = now.toISOString().slice(0, 10);
    const t = (q: string) => { const r = resolveRange(q, now); return sumCost(rows, r.from, r.to); };
    const periodCost = sumCost(rows, period.from, period.to);
    // previous equivalent period (same length, immediately before)
    const days = Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86400000) + 1;
    const prevTo = new Date(Date.parse(period.from) - 86400000).toISOString().slice(0, 10);
    const prevFrom = new Date(Date.parse(period.from) - days * 86400000).toISOString().slice(0, 10);
    const prevCost = sumCost(rows, prevFrom, prevTo);

    const { data: lastSync } = await db.from('meta_spend_sync')
      .select('created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(1);

    // category breakdown for the period
    const breakdown: Record<string, number> = {};
    for (const r of rows) if (r.day >= period.from && r.day <= period.to) breakdown[r.category] = (breakdown[r.category] ?? 0) + r.cost;

    return NextResponse.json({
      currency,
      period, period_cost: periodCost, pct_change: pctChange(periodCost, prevCost),
      today: t('today'), this_week: t('this_week'), this_month: t('this_month'),
      total: sumCost(rows, '0000-01-01', today),
      breakdown,
      last_synced_at: lastSync?.[0]?.created_at ?? null,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[MetaSpend summary]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

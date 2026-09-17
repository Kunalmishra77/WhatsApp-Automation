import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Bucket = 'active' | 'at_risk' | 'churning' | 'lost';
function bucketFor(days: number): Bucket {
  if (days <= 30) return 'active';
  if (days <= 90) return 'at_risk';
  if (days <= 180) return 'churning';
  return 'lost';
}

// GET /api/analytics/win-back?workspaceId=
// Churn analysis from order history: buckets customers by days-since-last-order
// and returns a value-ranked win-back list of lapsed customers to re-engage.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // Aggregate orders per contact.
    const agg = new Map<string, { lastAt: number; count: number; value: number; name: string | null }>();
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db
        .from('orders')
        .select('contact_id, customer_name, total_amount, created_at')
        .eq('workspace_id', workspaceId)
        .not('contact_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) return NextResponse.json({ error: 'Failed to read orders' }, { status: 500 });
      const rows = (data ?? []) as Array<{ contact_id: string; customer_name: string | null; total_amount: number | null; created_at: string }>;
      for (const o of rows) {
        const a = agg.get(o.contact_id) ?? { lastAt: 0, count: 0, value: 0, name: null };
        const t = Date.parse(o.created_at);
        if (!Number.isNaN(t) && t > a.lastAt) a.lastAt = t;
        a.count += 1;
        a.value += Number(o.total_amount ?? 0);
        if (!a.name && o.customer_name) a.name = o.customer_name;
        agg.set(o.contact_id, a);
      }
      if (rows.length < PAGE) break;
    }

    const now = Date.now();
    const buckets: Record<Bucket, { count: number; value: number }> = {
      active: { count: 0, value: 0 }, at_risk: { count: 0, value: 0 },
      churning: { count: 0, value: 0 }, lost: { count: 0, value: 0 },
    };
    const winBack: Array<{ id: string; name: string | null; daysSince: number; value: number; orders: number; bucket: Bucket }> = [];

    for (const [contactId, a] of agg) {
      const days = a.lastAt ? Math.floor((now - a.lastAt) / 86_400_000) : 9999;
      const b = bucketFor(days);
      buckets[b].count += 1;
      buckets[b].value += a.value;
      if (b !== 'active') {
        winBack.push({ id: contactId, name: a.name, daysSince: days, value: Math.round(a.value), orders: a.count, bucket: b });
      }
    }

    // Highest-value lapsed customers first — the best win-back targets.
    winBack.sort((x, y) => y.value - x.value);
    const atRiskRevenue = Math.round(buckets.at_risk.value + buckets.churning.value + buckets.lost.value);

    return NextResponse.json({
      buckets: {
        active: buckets.active, at_risk: buckets.at_risk, churning: buckets.churning, lost: buckets.lost,
      },
      totals: {
        customers: agg.size,
        lapsed: winBack.length,
        atRiskRevenue,
      },
      winBack: winBack.slice(0, 100),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[win-back]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

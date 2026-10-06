import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AdRow {
  ad_id: string;
  ad_name: string;
  ad_platform: string | null;
  leads: number;
  conversions: number;
  conversion_rate: number;
  revenue: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// GET /api/analytics/ad-performance?workspaceId=&from=&to=
// Per-AD breakdown of ad-sourced leads (CTWA + Instagram ads), grouped by ad_id:
// leads, conversions and revenue (deal value, falling back to linked orders). This
// is the return side at ad granularity — spend is still only available per channel
// (Meta spend is keyed by campaign, not ad), so this endpoint reports no per-ad spend.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const from = sp.get('from');
    const to = sp.get('to');

    // Realized revenue by conversation (fallback for converted leads with no deal value).
    const orderRevenueByConversation = new Map<string, number>();
    {
      const { data } = await db
        .from('orders')
        .select('conversation_id, total_amount, status')
        .eq('workspace_id', workspaceId)
        .not('conversation_id', 'is', null)
        .not('status', 'in', '(cancelled,refunded)')
        .limit(10000);
      for (const r of (data ?? []) as Array<{ conversation_id: string | null; total_amount: number | null }>) {
        if (!r.conversation_id) continue;
        orderRevenueByConversation.set(
          r.conversation_id,
          (orderRevenueByConversation.get(r.conversation_id) ?? 0) + Number(r.total_amount ?? 0),
        );
      }
    }

    const ads = new Map<string, { ad_name: string; ad_platform: string | null; leads: number; conversions: number; revenue: number }>();
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      let q = db
        .from('leads')
        .select('ad_id, ad_name, ad_platform, stage, value, conversation_id')
        .eq('workspace_id', workspaceId)
        .not('ad_id', 'is', null);
      if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
      if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
      const { data, error } = await q.order('id', { ascending: true }).range(offset, offset + PAGE - 1);
      if (error) {
        console.error('[AdPerf leads]', error);
        return NextResponse.json({ error: 'Failed to aggregate ads' }, { status: 500 });
      }
      const rows = (data ?? []) as Array<{ ad_id: string; ad_name: string | null; ad_platform: string | null; stage: string | null; value: number | null; conversation_id: string | null }>;
      for (const r of rows) {
        const key = r.ad_id;
        const b = ads.get(key) ?? { ad_name: r.ad_name ?? 'Ad', ad_platform: r.ad_platform, leads: 0, conversions: 0, revenue: 0 };
        if (r.ad_name) b.ad_name = r.ad_name;
        b.leads += 1;
        if (r.stage === 'converted') {
          b.conversions += 1;
          const dealValue = Number(r.value ?? 0);
          const orderValue = r.conversation_id ? (orderRevenueByConversation.get(r.conversation_id) ?? 0) : 0;
          b.revenue += dealValue > 0 ? dealValue : orderValue;
        }
        ads.set(key, b);
      }
      if (rows.length < PAGE) break;
    }

    const rows: AdRow[] = [...ads.entries()].map(([ad_id, b]) => ({
      ad_id,
      ad_name: b.ad_name,
      ad_platform: b.ad_platform,
      leads: b.leads,
      conversions: b.conversions,
      conversion_rate: b.leads > 0 ? round1((b.conversions / b.leads) * 100) : 0,
      revenue: round2(b.revenue),
    }));
    rows.sort((a, b) => b.revenue - a.revenue || b.conversions - a.conversions || b.leads - a.leads);

    return NextResponse.json({ ads: rows.slice(0, 50) });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdPerf GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

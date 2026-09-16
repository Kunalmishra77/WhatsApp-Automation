import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SourceRow {
  channel: string;
  leads: number;
  converted: number;
  conversion_rate: number; // 0..100, one decimal
}

// GET /api/analytics/lead-sources?workspaceId=&from=&to=
// Exact lead counts + conversion rate per normalized channel. Paginated read
// (no 1000-row cap — per the data-integrity standard). Workspace-scoped.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const from = sp.get('from');
    const to = sp.get('to');

    const applyFilters = (q: any) => {
      q = q.eq('workspace_id', workspaceId);
      if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
      if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
      return q;
    };

    // Page through (channel, stage) for every matching lead and aggregate in
    // memory — exact, and cheap (two small columns).
    const PAGE = 1000;
    const totals = new Map<string, { leads: number; converted: number }>();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await applyFilters(db.from('leads').select('channel, stage'))
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.error('[LeadSources GET]', error);
        return NextResponse.json({ error: 'Failed to aggregate lead sources' }, { status: 500 });
      }
      const rows = (data ?? []) as Array<{ channel: string | null; stage: string | null }>;
      for (const r of rows) {
        const ch = r.channel ?? 'other';
        const bucket = totals.get(ch) ?? { leads: 0, converted: 0 };
        bucket.leads += 1;
        if (r.stage === 'converted') bucket.converted += 1;
        totals.set(ch, bucket);
      }
      if (rows.length < PAGE) break;
    }

    const sources: SourceRow[] = [...totals.entries()]
      .map(([channel, v]) => ({
        channel,
        leads: v.leads,
        converted: v.converted,
        conversion_rate: v.leads > 0 ? Math.round((v.converted / v.leads) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.leads - a.leads);

    const totalLeads = sources.reduce((s, r) => s + r.leads, 0);
    const totalConverted = sources.reduce((s, r) => s + r.converted, 0);

    return NextResponse.json({
      sources,
      totals: {
        leads: totalLeads,
        converted: totalConverted,
        conversion_rate: totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 1000) / 10 : 0,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[LeadSources GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

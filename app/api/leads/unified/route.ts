import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT = `
  id, title, stage, temperature, priority, value, currency,
  channel, source, source_detail, utm_source, utm_medium, utm_campaign,
  first_touch_channel, first_touch_at, last_touch_channel, last_touch_at,
  created_at,
  contacts(id, name, phone)
`;

// GET /api/leads/unified?workspaceId=&channel=&stage=&from=&to=&search=&page=&pageSize=
// Paginated leads with normalized channel/source attribution + filters — the
// data table behind the Unified Lead Hub. Exact count, workspace-scoped.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    const ctx = await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const channel = sp.get('channel');
    const stage = sp.get('stage');
    const from = sp.get('from');
    const to = sp.get('to');
    const search = sp.get('search')?.trim();
    const page = Math.max(0, parseInt(sp.get('page') ?? '0', 10) || 0);
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '50', 10) || 50));

    const applyFilters = (q: any) => {
      q = q.eq('workspace_id', workspaceId);
      // Defense-in-depth agent isolation (mirrors leads/export): an agent may
      // only ever see leads assigned to them (view_analytics already excludes
      // agents, but the admin client bypasses RLS so scope stays explicit).
      if (ctx.role === 'agent') q = q.eq('assigned_agent_id', ctx.userId);
      if (channel && channel !== 'all') q = q.eq('channel', channel);
      if (stage && stage !== 'all') q = q.eq('stage', stage);
      if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
      if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
      if (search) q = q.ilike('title', `%${search}%`);
      return q;
    };

    const { count, error: countErr } = await applyFilters(
      db.from('leads').select('*', { count: 'exact', head: true }),
    );
    if (countErr) {
      console.error('[LeadsUnified count]', countErr);
      return NextResponse.json({ error: 'Failed to count leads' }, { status: 500 });
    }

    const { data, error } = await applyFilters(db.from('leads').select(SELECT))
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) {
      console.error('[LeadsUnified GET]', error);
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    }

    return NextResponse.json({
      data: data ?? [],
      count: count ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[LeadsUnified GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

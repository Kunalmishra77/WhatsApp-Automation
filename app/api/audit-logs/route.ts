import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse } from '@/lib/authz';

// GET /api/audit-logs?workspaceId=&page=0&limit=50&action=&entityType=&from=&to=
export async function GET(request: NextRequest) {
  try {
    const url         = request.nextUrl;
    const workspaceId = url.searchParams.get('workspaceId') ?? '';
    const page        = parseInt(url.searchParams.get('page') ?? '0', 10);
    const limit       = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const action      = url.searchParams.get('action') ?? '';
    const entityType  = url.searchParams.get('entityType') ?? '';
    const from        = url.searchParams.get('from') ?? '';
    const to          = url.searchParams.get('to') ?? '';

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    let q = db
      .from('activities')
      .select(`
        id, action, entity_type, entity_id, metadata, created_at,
        profiles:actor_id (id, full_name, email)
      `, { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    if (action)     q = q.ilike('action', `%${action}%`);
    if (entityType) q = q.eq('entity_type', entityType);
    if (from)       q = q.gte('created_at', `${from}T00:00:00Z`);
    if (to)         q = q.lte('created_at', `${to}T23:59:59Z`);

    const { data, count, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      logs: data ?? [],
      meta: { total: count ?? 0, page, limit },
    });
  } catch (error) {
    return authzResponse(error);
  }
}

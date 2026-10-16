import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { activityLabel } from '@/lib/activity-labels';

// GET /api/team/activity?workspaceId=&page=0&limit=50&actorId=&action=&entityType=&from=&to=
//
// The workspace activity trail: who did what, when, and from where. Backed by
// public.activities, which lib/activity-log.ts now writes from every mutating
// endpoint that matters (before, three endpoints wrote it and nothing else did,
// so the trail was effectively empty).
export async function GET(request: NextRequest) {
  try {
    const sp          = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId') ?? '';
    const page        = Math.max(parseInt(sp.get('page') ?? '0', 10), 0);
    const limit       = Math.min(parseInt(sp.get('limit') ?? '50', 10), 100);
    const actorId     = sp.get('actorId') ?? '';
    const action      = sp.get('action') ?? '';
    const entityType  = sp.get('entityType') ?? '';
    const from        = sp.get('from') ?? '';
    const to          = sp.get('to') ?? '';

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    // The trail names colleagues and their actions, so it is admin/manager territory.
    await requireWorkspacePermission(workspaceId, 'manage_team');

    const db = createAdminClient() as any;
    let q = db
      .from('activities')
      .select(`
        id, action, entity_type, entity_id, entity_label, metadata,
        ip_address, user_agent, created_at,
        actor:profiles!actor_id(id, full_name, email, avatar_url)
      `, { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    if (actorId)    q = q.eq('actor_id', actorId);
    if (action)     q = q.ilike('action', `%${action}%`);
    if (entityType) q = q.eq('entity_type', entityType);
    if (from)       q = q.gte('created_at', `${from}T00:00:00Z`);
    if (to)         q = q.lte('created_at', `${to}T23:59:59Z`);

    const { data, count, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const entries = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      // Resolved server-side so every client renders the same wording.
      label: activityLabel(row['action'] as string),
    }));

    return NextResponse.json({
      entries,
      meta: { total: count ?? 0, page, limit },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamActivity GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

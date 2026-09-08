import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/dashboard-stats/my-work?workspaceId=
// Summary for the 'agent' role's restricted dashboard — scoped to the caller's
// own assignments. Uses the admin client for the queries (same pattern as the
// main /api/dashboard-stats route) but every query is explicitly filtered by
// assigned_agent_id = caller, since this is a summary view, not a security
// boundary — the RLS isolation from migration 049 is what actually enforces
// the restriction everywhere else (conversations list, leads list, etc).
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const auth = await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Paginate the per-agent lists so the status/stage breakdown + totals stay accurate
    // beyond PostgREST's 1000-row default (a long-tenured agent can exceed it).
    const pageAll = async (table: string, col: string): Promise<any[]> => {
      const out: any[] = [];
      let off = 0;
      while (true) {
        const { data } = await db.from(table).select(col)
          .eq('workspace_id', workspaceId).eq('assigned_agent_id', auth.userId)
          .range(off, off + 999);
        if (!data?.length) break;
        out.push(...data);
        if (data.length < 1000) break;
        off += 1000;
      }
      return out;
    };

    const [conversations, leads, resolvedTodayRes] = await Promise.all([
      pageAll('conversations', 'status') as Promise<Array<{ status: string }>>,
      pageAll('leads', 'stage') as Promise<Array<{ stage: string }>>,
      db.from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('assigned_agent_id', auth.userId)
        .eq('status', 'resolved')
        .gte('resolved_at', todayStart.toISOString()),
    ]);

    const convByStatus = conversations.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    }, {});
    const leadsByStage = leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.stage] = (acc[l.stage] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      conversations: {
        open:      convByStatus.open ?? 0,
        assigned:  convByStatus.assigned ?? 0,
        pending:   convByStatus.pending ?? 0,
        resolved:  convByStatus.resolved ?? 0,
        total:     conversations.length,
        resolvedToday: resolvedTodayRes.count ?? 0,
      },
      leads: {
        new:         leadsByStage.new ?? 0,
        contacted:   leadsByStage.contacted ?? 0,
        follow_up:   leadsByStage.follow_up ?? 0,
        interested:  leadsByStage.interested ?? 0,
        converted:   leadsByStage.converted ?? 0,
        total:       leads.length,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[MyWorkStats]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

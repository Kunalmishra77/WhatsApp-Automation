import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, type QuickRange } from '@/lib/date-range';
import { buildDropoff, type DropoffRow } from '@/lib/flow-dropoff';

// GET /api/flows/[id]/analytics?range=this_month
//
// Where customers leave this flow. Per step: how many sessions got there, and
// how many got no further.
//
// The second number is the point. A flow's completion rate says people are
// leaving; only this says where, and a step with 90 arrivals and 80 stops is
// invisible in any count of completions.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;

    const { data: flow } = await db
      .from('chatbot_flows')
      .select('id, workspace_id, name, nodes')
      .eq('id', id)
      .maybeSingle();

    if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });

    const workspaceId = flow.workspace_id as string;
    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const range = (request.nextUrl.searchParams.get('range') ?? 'this_month') as QuickRange;
    const { fromUtc, toUtc } = resolveRange(range);

    // Both functions take the workspace id as well as the flow id and require
    // them to match — the flow was read by id above, so the authorization is
    // what ties the two together.
    const [dropoffRes, totalsRes] = await Promise.all([
      db.rpc('flow_dropoff', {
        p_workspace: workspaceId, p_flow: id, p_from: fromUtc, p_to: toUtc,
      }),
      db.rpc('flow_session_totals', {
        p_workspace: workspaceId, p_flow: id, p_from: fromUtc, p_to: toUtc,
      }),
    ]);

    if (dropoffRes.error || totalsRes.error) {
      const err = dropoffRes.error ?? totalsRes.error;
      console.error('[FlowAnalytics] RPC failed:', err.message);
      // Reported rather than rendered as zeros: a flow with no sessions and a
      // flow whose report failed look identical, and only one of them is news.
      return NextResponse.json({ error: 'Could not read this flow’s numbers.' }, { status: 500 });
    }

    const totals = (totalsRes.data?.[0] ?? { sessions: 0, active: 0, expired: 0 }) as {
      sessions: number; active: number; expired: number;
    };

    return NextResponse.json({
      flow: { id: flow.id, name: flow.name },
      range,
      totals: {
        sessions: Number(totals.sessions ?? 0),
        active: Number(totals.active ?? 0),
        expired: Number(totals.expired ?? 0),
      },
      steps: buildDropoff(
        (flow.nodes ?? []) as Array<{ id: string; type?: string; data?: unknown }>,
        (dropoffRes.data ?? []) as DropoffRow[],
      ),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[FlowAnalytics]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

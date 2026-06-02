import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/team/balance
// Body: { workspaceId }
// Distributes unassigned open conversations evenly among online agents
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    // Get online agents
    const { data: onlineMembers } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('role', ['admin', 'manager', 'agent'])
      .eq('is_online', true);

    let agents = (onlineMembers ?? []) as Array<{ user_id: string }>;

    // Fall back to all agents if none online
    if (!agents.length) {
      const { data: allMembers } = await db
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .in('role', ['admin', 'manager', 'agent']);
      agents = allMembers ?? [];
    }

    if (!agents.length) return NextResponse.json({ error: 'No agents available' }, { status: 422 });

    // Get unassigned conversations
    const { data: unassigned } = await db
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .in('status', ['open', 'pending'])
      .is('assigned_agent_id', null)
      .limit(200);

    if (!unassigned?.length) return NextResponse.json({ assigned: 0 });

    // Round-robin assignment
    let assigned = 0;
    for (let i = 0; i < unassigned.length; i++) {
      const agentId = agents[i % agents.length]!.user_id;
      await db
        .from('conversations')
        .update({ assigned_agent_id: agentId, status: 'assigned' })
        .eq('id', (unassigned[i] as { id: string }).id);
      assigned++;
    }

    return NextResponse.json({ assigned, agents: agents.length });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

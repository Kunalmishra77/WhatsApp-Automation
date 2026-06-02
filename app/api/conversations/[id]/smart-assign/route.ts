import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

type Params = { params: Promise<{ id: string }> };

// POST /api/conversations/[id]/smart-assign
// Body: { workspaceId }
// Assigns the conversation to the best available agent based on workload + expertise
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: conversationId } = await params;
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    // Fetch online agents in this workspace
    const { data: members } = await db
      .from('workspace_members')
      .select('user_id, profiles:user_id(full_name, expertise_tags)')
      .eq('workspace_id', workspaceId)
      .in('role', ['admin', 'manager', 'agent'])
      .eq('is_online', true);

    if (!members?.length) {
      // Fall back to any available agent if none online
      const { data: allMembers } = await db
        .from('workspace_members')
        .select('user_id, profiles:user_id(full_name, expertise_tags)')
        .eq('workspace_id', workspaceId)
        .in('role', ['admin', 'manager', 'agent']);

      if (!allMembers?.length) {
        return NextResponse.json({ error: 'No agents available' }, { status: 422 });
      }
      members?.push(...allMembers);
    }

    // Get open conversation counts per agent (workload)
    const agentIds = (members as Array<{ user_id: string }>).map((m) => m.user_id);
    const { data: openConvs } = await db
      .from('conversations')
      .select('assigned_agent_id')
      .eq('workspace_id', workspaceId)
      .in('status', ['open', 'assigned', 'pending'])
      .in('assigned_agent_id', agentIds);

    const loadMap: Record<string, number> = {};
    for (const id of agentIds) loadMap[id] = 0;
    for (const c of (openConvs ?? []) as Array<{ assigned_agent_id: string }>) {
      if (c.assigned_agent_id) loadMap[c.assigned_agent_id] = (loadMap[c.assigned_agent_id] ?? 0) + 1;
    }

    // Get the current conversation's last message to match expertise
    const { data: conv } = await db
      .from('conversations')
      .select('last_message, labels')
      .eq('id', conversationId)
      .single();

    const convText = ((conv?.last_message ?? '') + ' ' + ((conv?.labels ?? []) as string[]).join(' ')).toLowerCase();

    // Score each agent: lower load = higher score, expertise match = bonus
    let bestAgentId: string | null = null;
    let bestScore = -Infinity;

    for (const m of members as Array<{ user_id: string; profiles?: { expertise_tags?: string[] } }>) {
      const load   = loadMap[m.user_id] ?? 0;
      let agentScore = -load; // fewer conversations = better

      // Expertise tag match
      const expertiseTags = m.profiles?.expertise_tags ?? [];
      for (const tag of expertiseTags) {
        if (convText.includes(tag.toLowerCase())) agentScore += 5;
      }

      if (agentScore > bestScore) {
        bestScore = agentScore;
        bestAgentId = m.user_id;
      }
    }

    if (!bestAgentId) return NextResponse.json({ error: 'No suitable agent found' }, { status: 422 });

    // Assign
    await db
      .from('conversations')
      .update({ assigned_agent_id: bestAgentId, status: 'assigned' })
      .eq('id', conversationId);

    const assignedAgent = (members as Array<{ user_id: string; profiles?: { full_name?: string } }>)
      .find((m) => m.user_id === bestAgentId);

    return NextResponse.json({
      assignedAgentId: bestAgentId,
      assignedName: assignedAgent?.profiles?.full_name ?? 'Agent',
      load: loadMap[bestAgentId] ?? 0,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

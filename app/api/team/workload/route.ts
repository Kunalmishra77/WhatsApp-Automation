import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/team/workload?workspaceId=
// Returns per-agent open conversation counts + online status
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const { data: members } = await db
      .from('workspace_members')
      .select('user_id, is_online, role, profiles:user_id(full_name, email, avatar_url, expertise_tags)')
      .eq('workspace_id', workspaceId)
      .in('role', ['admin', 'manager', 'agent']);

    if (!members?.length) return NextResponse.json({ agents: [], unassigned: 0 });

    const agentIds = (members as Array<{ user_id: string }>).map((m) => m.user_id);

    // Count open conversations per agent
    const { data: assigned } = await db
      .from('conversations')
      .select('assigned_agent_id')
      .eq('workspace_id', workspaceId)
      .in('status', ['open', 'assigned', 'pending'])
      .not('assigned_agent_id', 'is', null);

    const loadMap: Record<string, number> = {};
    for (const id of agentIds) loadMap[id] = 0;
    for (const c of (assigned ?? []) as Array<{ assigned_agent_id: string }>) {
      if (c.assigned_agent_id && loadMap[c.assigned_agent_id] !== undefined) {
        loadMap[c.assigned_agent_id] = (loadMap[c.assigned_agent_id] ?? 0) + 1;
      }
    }

    // Count unassigned conversations
    const { count: unassigned } = await db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('status', ['open', 'pending'])
      .is('assigned_agent_id', null);

    const agents = (members as Array<{
      user_id: string;
      is_online: boolean;
      role: string;
      profiles?: { full_name: string; email: string; avatar_url: string | null; expertise_tags: string[] };
    }>).map((m) => ({
      userId:        m.user_id,
      name:          m.profiles?.full_name ?? m.profiles?.email ?? m.user_id,
      email:         m.profiles?.email ?? '',
      avatarUrl:     m.profiles?.avatar_url ?? null,
      isOnline:      m.is_online,
      role:          m.role,
      expertiseTags: m.profiles?.expertise_tags ?? [],
      openCount:     loadMap[m.user_id] ?? 0,
    })).sort((a, b) => a.openCount - b.openCount);

    return NextResponse.json({ agents, unassigned: unassigned ?? 0 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

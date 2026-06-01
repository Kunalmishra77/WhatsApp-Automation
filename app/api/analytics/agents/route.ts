import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export interface AgentPerformanceStat {
  agentId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  totalAssigned: number;
  resolved: number;
  avgFirstResponseMin: number;
  csatAvgScore: number | null;
  messagesSent: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to date params required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const supabase = createAdminClient();

    // --- Get all workspace members with profiles ---
    const { data: membersRaw, error: membersErr } = await (supabase as any)
      .from('workspace_members')
      .select('user_id, profiles!workspace_members_user_id_fkey(full_name, email, avatar_url)')
      .eq('workspace_id', workspaceId);

    if (membersErr) {
      console.error('[Analytics Agents] members error', membersErr);
      return NextResponse.json({ error: 'Failed to fetch workspace members' }, { status: 500 });
    }

    const members = (membersRaw ?? []) as Array<{
      user_id: string;
      profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
    }>;

    const fromTs = `${from}T00:00:00.000Z`;
    const toTs = `${to}T23:59:59.999Z`;

    const agents: AgentPerformanceStat[] = await Promise.all(
      members.map(async (member) => {
        const agentId = member.user_id;
        const profile = member.profiles;

        // totalAssigned: conversations where assigned_agent_id = agentId, updated in period
        const { count: totalAssigned } = await (supabase as any)
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('assigned_agent_id', agentId)
          .gte('updated_at', fromTs)
          .lte('updated_at', toTs);

        // resolved: conversations resolved by this agent in period
        const { count: resolved } = await (supabase as any)
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('assigned_agent_id', agentId)
          .eq('status', 'resolved')
          .gte('resolved_at', fromTs)
          .lte('resolved_at', toTs);

        // messagesSent: outbound messages sent by this agent in period
        const { count: messagesSent } = await (supabase as any)
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('sender_id', agentId)
          .eq('sender_type', 'agent')
          .gte('created_at', fromTs)
          .lte('created_at', toTs);

        // avgFirstResponseMin: avg minutes from assignment to first outbound message
        // Approximate: get conversations assigned to agent, find first agent message per conversation
        const { data: assignedConvos } = await (supabase as any)
          .from('conversations')
          .select('id, assigned_at')
          .eq('workspace_id', workspaceId)
          .eq('assigned_agent_id', agentId)
          .gte('updated_at', fromTs)
          .lte('updated_at', toTs)
          .not('assigned_at', 'is', null)
          .limit(100);

        let avgFirstResponseMin = 0;
        const convos = (assignedConvos ?? []) as Array<{ id: string; assigned_at: string }>;
        if (convos.length > 0) {
          const responseTimes: number[] = [];
          for (const convo of convos) {
            const { data: firstMsg } = await (supabase as any)
              .from('messages')
              .select('created_at')
              .eq('workspace_id', workspaceId)
              .eq('conversation_id', convo.id)
              .eq('sender_id', agentId)
              .eq('sender_type', 'agent')
              .gte('created_at', convo.assigned_at)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();

            if (firstMsg?.created_at) {
              const diffMs =
                new Date(firstMsg.created_at).getTime() -
                new Date(convo.assigned_at).getTime();
              if (diffMs >= 0) {
                responseTimes.push(diffMs / 60_000);
              }
            }
          }
          if (responseTimes.length > 0) {
            avgFirstResponseMin =
              Math.round(
                (responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length) * 10,
              ) / 10;
          }
        }

        // csatAvgScore: avg CSAT score for this agent's conversations in period
        const { data: csatRaw } = await (supabase as any)
          .from('csat_responses')
          .select('score')
          .eq('agent_id', agentId)
          .not('score', 'is', null)
          .gte('responded_at', fromTs)
          .lte('responded_at', toTs);

        const csatRows = (csatRaw ?? []) as Array<{ score: number }>;
        const csatAvgScore: number | null =
          csatRows.length > 0
            ? Math.round(
                (csatRows.reduce((sum, r) => sum + r.score, 0) / csatRows.length) * 10,
              ) / 10
            : null;

        return {
          agentId,
          name: profile?.full_name ?? 'Unknown',
          email: profile?.email ?? '',
          avatarUrl: profile?.avatar_url ?? null,
          totalAssigned: totalAssigned ?? 0,
          resolved: resolved ?? 0,
          avgFirstResponseMin,
          csatAvgScore,
          messagesSent: messagesSent ?? 0,
        };
      }),
    );

    return NextResponse.json({ agents });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Analytics Agents GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

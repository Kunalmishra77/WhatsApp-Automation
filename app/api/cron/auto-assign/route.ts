import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Auto-assignment sweep. Scheduled by pg_cron every 10 minutes (migration 079).
// Distributes unassigned OPEN conversations (and their linked lead) to the
// least-busy team member, per workspace — load-balanced round-robin. Only acts on
// workspaces that actually have assignable agents (admin/manager/agent); a solo
// super_admin workspace has no team, so it is skipped (nothing to distribute).
// Mirrors the existing on-demand /conversations/[id]/smart-assign scoring.
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;
  const deadline = Date.now() + 55_000;
  const PER_RUN_CAP = 300;

  // Assignable team members across all workspaces (excludes solo super_admin owners).
  const { data: members } = await db
    .from('workspace_members')
    .select('workspace_id, user_id')
    .in('role', ['admin', 'manager', 'agent']);

  // workspace_id -> agent user_ids
  const agentsByWs = new Map<string, string[]>();
  for (const m of (members ?? []) as Array<{ workspace_id: string; user_id: string }>) {
    const arr = agentsByWs.get(m.workspace_id) ?? [];
    arr.push(m.user_id);
    agentsByWs.set(m.workspace_id, arr);
  }

  let assigned = 0;
  for (const [workspaceId, agentIds] of agentsByWs) {
    if (Date.now() > deadline || assigned >= PER_RUN_CAP) break;
    if (agentIds.length === 0) continue;

    // Current load = open/assigned/pending conversations already on each agent.
    const { data: loadRows } = await db
      .from('conversations')
      .select('assigned_agent_id')
      .eq('workspace_id', workspaceId)
      .in('status', ['open', 'assigned', 'pending'])
      .in('assigned_agent_id', agentIds);
    const load: Record<string, number> = {};
    for (const id of agentIds) load[id] = 0;
    for (const r of (loadRows ?? []) as Array<{ assigned_agent_id: string | null }>) {
      if (r.assigned_agent_id && load[r.assigned_agent_id] != null) load[r.assigned_agent_id]!++;
    }

    // Unassigned open conversations, oldest first.
    const { data: unassigned } = await db
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .is('assigned_agent_id', null)
      .in('status', ['open', 'pending'])
      .eq('is_spam', false)
      .order('last_message_at', { ascending: true, nullsFirst: true })
      .limit(100);

    for (const conv of (unassigned ?? []) as Array<{ id: string }>) {
      if (Date.now() > deadline || assigned >= PER_RUN_CAP) break;
      // Pick the least-busy agent.
      const bestAgent = agentIds.reduce((best, id) => (load[id]! < load[best]! ? id : best), agentIds[0]!);
      const { error } = await db
        .from('conversations')
        .update({ assigned_agent_id: bestAgent, status: 'assigned', updated_at: new Date().toISOString() })
        .eq('id', conv.id)
        .eq('workspace_id', workspaceId)
        .is('assigned_agent_id', null); // atomic claim — never double-assign
      if (error) continue;
      // Assign the linked lead to the same agent (keeps ownership consistent).
      await db
        .from('leads')
        .update({ assigned_agent_id: bestAgent })
        .eq('conversation_id', conv.id)
        .eq('workspace_id', workspaceId)
        .is('assigned_agent_id', null);
      load[bestAgent]!++;
      assigned++;
    }
  }

  return NextResponse.json({ assigned });
}

export async function POST(request: NextRequest) { return run(request); }
export async function GET(request: NextRequest) { return run(request); }

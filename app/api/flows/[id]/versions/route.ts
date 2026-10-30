import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { describeVersionChange } from '@/lib/flow-versions';

// GET  /api/flows/[id]/versions            — the saved history, newest first
// POST /api/flows/[id]/versions            — { versionId } restores one
//
// Written by a trigger on `chatbot_flows` (migration 141), not by the save
// route, so a change made by SQL is in the history too — and that is the half
// most worth having, because nobody is watching when a migration runs.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;

    const { data: flow } = await db
      .from('chatbot_flows')
      .select('id, workspace_id')
      .eq('id', id)
      .maybeSingle();
    if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });

    await requireWorkspacePermission(flow.workspace_id as string, 'manage_templates');

    // 51 rows at most exist per flow (the trigger caps at 50), so this is the
    // whole history rather than a page of it.
    const { data, error } = await db
      .from('flow_versions')
      .select('id, name, nodes, edges, source, created_by, created_at')
      .eq('flow_id', id)
      .eq('workspace_id', flow.workspace_id)
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) {
      console.error('[FlowVersions] read failed:', error.message);
      return NextResponse.json({ error: 'Could not read the history.' }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      id: string; name: string | null; nodes: unknown; edges: unknown;
      source: string; created_by: string | null; created_at: string;
    }>;

    // Who saved it, resolved in one lookup rather than one per row.
    const userIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await db
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        names.set(p.id, p.full_name?.trim() || p.email || 'A team member');
      }
    }

    return NextResponse.json({
      versions: rows.map((r, i) => ({
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        // The newest version is the flow as it stands, which is what makes the
        // list readable instead of asking someone to reason about which
        // snapshot preceded which edit.
        isCurrent: i === 0,
        stepCount: Array.isArray(r.nodes) ? r.nodes.length : 0,
        by: r.created_by ? names.get(r.created_by) ?? 'A team member' : null,
        // 'sql' means nothing attributed it — a migration or a direct edit.
        source: r.source,
        change: describeVersionChange(
          { nodes: r.nodes, edges: r.edges, name: r.name },
          rows[i + 1] ? { nodes: rows[i + 1]!.nodes, edges: rows[i + 1]!.edges, name: rows[i + 1]!.name } : null,
        ),
      })),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[FlowVersions GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { versionId } = await request.json() as { versionId?: string };
    if (!versionId) {
      return NextResponse.json({ error: 'versionId required' }, { status: 400 });
    }

    const db = createAdminClient() as any;
    const { data: flow } = await db
      .from('chatbot_flows')
      .select('id, workspace_id')
      .eq('id', id)
      .maybeSingle();
    if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });

    const workspaceId = flow.workspace_id as string;
    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const { data, error } = await db.rpc('flow_restore_version', {
      p_workspace: workspaceId, p_flow: id, p_version: versionId,
    });

    if (error) {
      console.error('[FlowVersions] restore failed:', error.message);
      return NextResponse.json({ error: 'Could not restore that version.' }, { status: 500 });
    }
    if (data !== true) {
      // The version id did not belong to this flow and this workspace. Said as
      // not-found rather than forbidden: a caller probing uuids learns nothing
      // either way.
      return NextResponse.json({ error: 'That version is not part of this flow.' }, { status: 404 });
    }

    const { data: restored } = await db
      .from('chatbot_flows')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    return NextResponse.json({ flow: restored });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[FlowVersions POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

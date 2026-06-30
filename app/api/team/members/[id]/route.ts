import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// PATCH /api/team/members/[id]
// Body: { workspaceId, role }
// Server-side gate on top of the RLS fix in migration 050 — defense in depth,
// not just relying on RLS for a security-sensitive role change.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspaceId, role } = await request.json() as { workspaceId?: string; role?: string };
    if (!workspaceId || !role) {
      return NextResponse.json({ error: 'workspaceId and role required' }, { status: 400 });
    }
    if (!['admin', 'manager', 'agent'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_team');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { error } = await db
      .from('workspace_members')
      .update({ role })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamMembers PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/team/members/[id]?workspaceId=  — remove a member from the workspace
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const auth = await requireWorkspacePermission(workspaceId, 'manage_team');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { data: target } = await db
      .from('workspace_members').select('user_id').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();

    if (target?.user_id === auth.userId) {
      return NextResponse.json({ error: "You can't remove yourself from the workspace" }, { status: 400 });
    }

    const { error } = await db
      .from('workspace_members')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamMembers DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

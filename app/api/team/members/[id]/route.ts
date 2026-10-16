import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { ALL_PERMISSIONS, type Permission } from '@/types/auth.types';
import { ALL_AGENT_PAGE_KEYS } from '@/lib/agent-pages';
import { logActivity } from '@/lib/activity-log';

const ASSIGNABLE_ROLES = ['admin', 'manager', 'agent'];

const cleanPermissions = (v: unknown): Permission[] =>
  Array.isArray(v) ? [...new Set(v.filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission)))] : [];

const cleanPages = (v: unknown): string[] | null =>
  Array.isArray(v) ? [...new Set(v.filter((k) => ALL_AGENT_PAGE_KEYS.includes(k as never)))] : null;

// PATCH /api/team/members/[id]
// Body: { workspaceId, role?, title?, customRoleId?, pageAccess?, permissionOverrides?, isSuspended? }
//
// Server-side gate on top of the RLS fix in migration 050 — defense in depth,
// not just relying on RLS for a security-sensitive role change.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json() as {
      workspaceId?: string;
      role?: string;
      title?: string | null;
      customRoleId?: string | null;
      pageAccess?: unknown;             // array = restrict to these pages; null = unrestricted
      permissionOverrides?: { grant?: unknown; revoke?: unknown } | null;
      isSuspended?: boolean;
    };
    const workspaceId = body.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    if (body.role !== undefined && !ASSIGNABLE_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const auth = await requireWorkspacePermission(workspaceId, 'manage_team');
    const db = createAdminClient() as any;

    const { data: target } = await db
      .from('workspace_members')
      .select('id, user_id, role, title, is_suspended, profiles(full_name, email)')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    // The workspace owner's access is not editable by anyone else — otherwise an
    // admin could lock the owner out of their own workspace.
    if (target.role === 'super_admin' && target.user_id !== auth.userId) {
      return NextResponse.json({ error: 'The workspace owner cannot be edited' }, { status: 403 });
    }
    // And nobody demotes or suspends themselves into a corner by accident.
    if (target.user_id === auth.userId && (body.isSuspended === true || body.role !== undefined)) {
      return NextResponse.json({ error: 'You cannot change your own role or suspend yourself' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.role !== undefined)         patch['role']           = body.role;
    if (body.title !== undefined)        patch['title']          = body.title?.trim() || null;
    if (body.customRoleId !== undefined) patch['custom_role_id'] = body.customRoleId || null;
    if (body.pageAccess !== undefined)   patch['page_access']    = cleanPages(body.pageAccess);
    if (body.isSuspended !== undefined)  patch['is_suspended']   = Boolean(body.isSuspended);
    if (body.permissionOverrides !== undefined) {
      patch['permission_overrides'] = body.permissionOverrides
        ? {
            grant:  cleanPermissions(body.permissionOverrides.grant),
            revoke: cleanPermissions(body.permissionOverrides.revoke),
          }
        : {};
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // A custom role must belong to this workspace.
    if (patch['custom_role_id']) {
      const { data: role } = await db
        .from('workspace_roles').select('id').eq('id', patch['custom_role_id'])
        .eq('workspace_id', workspaceId).maybeSingle();
      if (!role) return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
    }

    const { error } = await db
      .from('workspace_members')
      .update(patch)
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) throw new Error(error.message);

    const label = (target.profiles?.full_name as string | undefined)
      ?? (target.profiles?.email as string | undefined)
      ?? null;

    // Security-relevant changes are recorded separately so the trail reads clearly.
    if (body.role !== undefined && body.role !== target.role) {
      await logActivity({
        workspaceId, actorId: auth.userId,
        action: 'team.role_changed', entityType: 'workspace_member',
        entityId: id, entityLabel: label,
        metadata: { from: target.role, to: body.role },
      });
    }
    if (body.isSuspended !== undefined && body.isSuspended !== target.is_suspended) {
      await logActivity({
        workspaceId, actorId: auth.userId,
        action: body.isSuspended ? 'team.member_suspended' : 'team.member_restored',
        entityType: 'workspace_member', entityId: id, entityLabel: label,
      });
    }
    const accessKeys = ['page_access', 'permission_overrides', 'custom_role_id', 'title']
      .filter((k) => k in patch);
    if (accessKeys.length > 0) {
      await logActivity({
        workspaceId, actorId: auth.userId,
        action: 'team.access_changed', entityType: 'workspace_member',
        entityId: id, entityLabel: label,
        metadata: { changed: accessKeys },
      });
    }

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
    const db = createAdminClient() as any;

    const { data: target } = await db
      .from('workspace_members')
      .select('user_id, role, profiles(full_name, email)')
      .eq('id', id).eq('workspace_id', workspaceId).maybeSingle();

    if (target?.user_id === auth.userId) {
      return NextResponse.json({ error: 'You cannot remove yourself from the workspace' }, { status: 400 });
    }
    if (target?.role === 'super_admin') {
      return NextResponse.json({ error: 'The workspace owner cannot be removed' }, { status: 403 });
    }

    const { error } = await db
      .from('workspace_members')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) throw new Error(error.message);

    await logActivity({
      workspaceId, actorId: auth.userId,
      action: 'team.member_removed', entityType: 'workspace_member',
      entityId: id,
      entityLabel: (target?.profiles?.full_name as string | undefined)
        ?? (target?.profiles?.email as string | undefined) ?? null,
      metadata: { role: target?.role ?? null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamMembers DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

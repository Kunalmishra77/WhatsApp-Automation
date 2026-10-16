import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { ALL_PERMISSIONS, type Permission } from '@/types/auth.types';
import { ALL_AGENT_PAGE_KEYS } from '@/lib/agent-pages';
import { logActivity } from '@/lib/activity-log';

const cleanPermissions = (v: unknown): Permission[] =>
  Array.isArray(v) ? [...new Set(v.filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission)))] : [];

const cleanPages = (v: unknown): string[] | null =>
  Array.isArray(v) ? [...new Set(v.filter((k) => ALL_AGENT_PAGE_KEYS.includes(k as never)))] : null;

// PATCH /api/team/roles/[id] — Body: { workspaceId, name?, description?, permissions?, pageAccess? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json() as {
      workspaceId?: string; name?: string; description?: string;
      permissions?: unknown; pageAccess?: unknown;
    };
    if (!body.workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const auth = await requireWorkspacePermission(body.workspaceId, 'manage_team');

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined)        patch['name']        = body.name.trim();
    if (body.description !== undefined) patch['description'] = body.description.trim() || null;
    if (body.permissions !== undefined) patch['permissions'] = cleanPermissions(body.permissions);
    if (body.pageAccess !== undefined)  patch['page_access'] = cleanPages(body.pageAccess);

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('workspace_roles')
      .update(patch)
      .eq('id', id)
      .eq('workspace_id', body.workspaceId)
      .select('id, name, description, permissions, page_access, created_at')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data)  return NextResponse.json({ error: 'Role not found' }, { status: 404 });

    await logActivity({
      workspaceId: body.workspaceId, actorId: auth.userId,
      action: 'team.role_updated', entityType: 'workspace_role',
      entityId: id, entityLabel: data.name,
      metadata: { changed: Object.keys(patch).filter((k) => k !== 'updated_at') },
    });

    return NextResponse.json({ role: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamRoles PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/team/roles/[id]?workspaceId=
// Members holding the role fall back to their built-in role (the FK is ON DELETE
// SET NULL), so nobody is locked out by removing a role.
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
    const { data: existing } = await db
      .from('workspace_roles').select('name').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();

    const { error } = await db
      .from('workspace_roles').delete().eq('id', id).eq('workspace_id', workspaceId);
    if (error) throw new Error(error.message);

    await logActivity({
      workspaceId, actorId: auth.userId,
      action: 'team.role_deleted', entityType: 'workspace_role',
      entityId: id, entityLabel: existing?.name ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamRoles DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

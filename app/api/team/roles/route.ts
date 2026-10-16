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

// GET /api/team/roles?workspaceId=
// Custom roles defined by this workspace, with how many members hold each.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    // Readable by anyone who can see the team, so the members list can show role names.
    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;
    const [{ data: roles }, { data: members }] = await Promise.all([
      db.from('workspace_roles')
        .select('id, name, description, permissions, page_access, created_at')
        .eq('workspace_id', workspaceId)
        .order('name'),
      db.from('workspace_members')
        .select('custom_role_id')
        .eq('workspace_id', workspaceId)
        .not('custom_role_id', 'is', null),
    ]);

    const counts = new Map<string, number>();
    for (const m of (members ?? []) as Array<{ custom_role_id: string }>) {
      counts.set(m.custom_role_id, (counts.get(m.custom_role_id) ?? 0) + 1);
    }

    return NextResponse.json({
      roles: ((roles ?? []) as Array<Record<string, unknown>>).map((r) => ({
        ...r,
        member_count: counts.get(r.id as string) ?? 0,
      })),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamRoles GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/team/roles  — Body: { workspaceId, name, description?, permissions[], pageAccess[]|null }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId?: string; name?: string; description?: string;
      permissions?: unknown; pageAccess?: unknown;
    };
    const workspaceId = body.workspaceId;
    const name = body.name?.trim();
    if (!workspaceId || !name) {
      return NextResponse.json({ error: 'workspaceId and name required' }, { status: 400 });
    }

    const auth = await requireWorkspacePermission(workspaceId, 'manage_team');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('workspace_roles')
      .insert({
        workspace_id: workspaceId,
        name,
        description: body.description?.trim() || null,
        permissions: cleanPermissions(body.permissions),
        page_access: cleanPages(body.pageAccess),
        created_by:  auth.userId,
      })
      .select('id, name, description, permissions, page_access, created_at')
      .single();

    if (error) {
      // UNIQUE (workspace_id, name)
      if (String(error.code) === '23505' || /duplicate key/i.test(String(error.message))) {
        return NextResponse.json({ error: 'A role with that name already exists' }, { status: 409 });
      }
      throw new Error(error.message);
    }

    await logActivity({
      workspaceId, actorId: auth.userId,
      action: 'team.role_created', entityType: 'workspace_role',
      entityId: data.id, entityLabel: data.name,
      metadata: { permissions: data.permissions, page_access: data.page_access },
    });

    return NextResponse.json({ role: { ...data, member_count: 0 } });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamRoles POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

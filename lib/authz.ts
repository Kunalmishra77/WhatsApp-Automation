import { createClient } from '@/services/supabase/server';
import { hasPermission, type Permission, type UserRole } from '@/types/auth.types';
import { agentEffectivePermissions, DEFAULT_AGENT_ALLOWED_PAGES } from '@/lib/agent-pages';
import { createAdminClient } from '@/services/supabase/admin';

export interface AuthzContext {
  userId: string;
  email: string;
  role: UserRole;
  workspaceId: string;
}

export class AuthzError extends Error {
  constructor(
    message: string,
    public readonly status = 403,
  ) {
    super(message);
  }
}

export async function requireWorkspacePermission(
  workspaceId: string,
  permission: Permission,
): Promise<AuthzContext> {
  return requireWorkspacePermissionAny(workspaceId, [permission]);
}

// Same as requireWorkspacePermission, but grants access if the caller's role has
// ANY one of the listed permissions (e.g. a read-only view page that both
// 'view_analytics' managers and 'billing_management' admins should be able to load).
export async function requireWorkspacePermissionAny(
  workspaceId: string,
  permissions: Permission[],
): Promise<AuthzContext> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AuthzError('Authentication required', 401);
  }

  const { data: member, error: memberError } = await (supabase as any)
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (memberError || !member) {
    throw new AuthzError('Workspace access denied', 403);
  }

  const role = member.role as UserRole;
  if (!(await roleGrants(role, workspaceId, permissions))) {
    throw new AuthzError('Insufficient permissions', 403);
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    role,
    workspaceId,
  };
}

// Does this role hold ANY of these permissions in this workspace?
//
// Every role but 'agent' answers purely from the static ROLE_PERMISSIONS matrix.
// An agent is the one role an admin configures per workspace, from the Team page:
// the pages they grant (workspaces.settings.agent_page_access) carry API permissions
// with them (see AGENT_PAGE_PERMISSIONS). Before this, those toggles only hid nav
// items — the page opened and then every request behind it 403'd.
async function roleGrants(
  role: UserRole,
  workspaceId: string,
  permissions: Permission[],
): Promise<boolean> {
  if (permissions.some((p) => hasPermission(role, p))) return true;
  if (role !== 'agent') return false;

  const db = createAdminClient() as any;
  const { data: ws } = await db
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .maybeSingle();

  const settings = (ws?.settings ?? {}) as Record<string, unknown>;
  const granted = (settings['agent_page_access'] as string[] | undefined) ?? DEFAULT_AGENT_ALLOWED_PAGES;
  const effective = agentEffectivePermissions(granted);
  return permissions.some((p) => effective.includes(p));
}

export function authzResponse(error: unknown): Response {
  if (error instanceof AuthzError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

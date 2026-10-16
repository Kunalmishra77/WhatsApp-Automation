import { createClient } from '@/services/supabase/server';
import { type Permission, type UserRole } from '@/types/auth.types';
import { resolveMemberAccess } from '@/lib/permissions';

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

  // One resolver answers "what may this member do here" for API routes and page
  // guards alike, so a configured role, per-member override or page grant is
  // honoured everywhere instead of only in the UI.
  const access = await resolveMemberAccess(workspaceId, user.id);

  if (!access) {
    throw new AuthzError('Workspace access denied', 403);
  }
  if (access.isSuspended) {
    throw new AuthzError('Your access to this workspace is suspended', 403);
  }
  if (!permissions.some((p) => access.permissions.includes(p))) {
    throw new AuthzError('Insufficient permissions', 403);
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    role: access.role,
    workspaceId,
  };
}

export function authzResponse(error: unknown): Response {
  if (error instanceof AuthzError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

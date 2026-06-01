import { createClient } from '@/services/supabase/server';
import { hasPermission, type Permission, type UserRole } from '@/types/auth.types';

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
  if (!hasPermission(role, permission)) {
    throw new AuthzError('Insufficient permissions', 403);
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    role,
    workspaceId,
  };
}

export function authzResponse(error: unknown): Response {
  if (error instanceof AuthzError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

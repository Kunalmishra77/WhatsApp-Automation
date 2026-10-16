import { createAdminClient } from '@/services/supabase/admin';
import {
  ROLE_PERMISSIONS, ALL_PERMISSIONS, type Permission, type UserRole,
} from '@/types/auth.types';
import {
  AGENT_PAGE_PERMISSIONS, ALL_AGENT_PAGE_KEYS, DEFAULT_AGENT_ALLOWED_PAGES,
  type AgentPageKey,
} from '@/lib/agent-pages';

/**
 * Everything that decides what one member may do in one workspace.
 *
 * Roles used to be the whole story: a fixed four-value enum, with page access
 * stored as a single list shared by every agent in the workspace. An admin could
 * not shape an individual employee's access, and nothing below the UI consulted
 * that list anyway. This resolver is now the one place that answers "what may
 * this member do here", for both API routes (lib/authz.ts) and page guards
 * (lib/page-guard.ts), so the two can never disagree.
 */
export interface MemberAccess {
  memberId: string;
  role: UserRole;
  /** Name of the assigned custom role, when one replaces the built-in role. */
  customRoleName: string | null;
  isSuspended: boolean;
  /** Fully resolved permission set — role/custom role, page grants, overrides. */
  permissions: Permission[];
  /** Allowed page keys, or null when this member is not page-restricted. */
  pageAccess: AgentPageKey[] | null;
}

const asPermissions = (v: unknown): Permission[] =>
  Array.isArray(v) ? v.filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission)) : [];

const asPageKeys = (v: unknown): AgentPageKey[] | null =>
  Array.isArray(v) ? v.filter((k): k is AgentPageKey => ALL_AGENT_PAGE_KEYS.includes(k as AgentPageKey)) : null;

/**
 * Resolve a member's effective access, or null when they aren't a member.
 *
 * Order of resolution:
 *  1. base permissions — the assigned custom role's set, else the role enum's
 *  2. page access      — member override, else custom role's, else (agents only)
 *                        the workspace default; anything else is unrestricted
 *  3. page grants       — each allowed page contributes the permissions its APIs
 *                        need, so granting a page actually opens it end to end
 *  4. per-member grant/revoke overrides
 *
 * super_admin is resolved last and always keeps the full set: the workspace owner
 * must never be able to configure themselves out of their own workspace.
 */
export async function resolveMemberAccess(
  workspaceId: string,
  userId: string,
): Promise<MemberAccess | null> {
  const db = createAdminClient() as any;

  const { data: member } = await db
    .from('workspace_members')
    .select('id, role, custom_role_id, page_access, permission_overrides, is_suspended')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member) return null;

  const role = member.role as UserRole;

  if (role === 'super_admin') {
    return {
      memberId: member.id as string,
      role,
      customRoleName: null,
      isSuspended: false,
      permissions: [...ROLE_PERMISSIONS.super_admin],
      pageAccess: null,
    };
  }

  // ── 1. base permissions ───────────────────────────────────────────────────
  let customRoleName: string | null = null;
  let customRolePages: AgentPageKey[] | null = null;
  let base: Permission[] = [...(ROLE_PERMISSIONS[role] ?? [])];

  if (member.custom_role_id) {
    const { data: cr } = await db
      .from('workspace_roles')
      .select('name, permissions, page_access')
      .eq('id', member.custom_role_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (cr) {
      customRoleName  = cr.name as string;
      base            = asPermissions(cr.permissions);
      customRolePages = asPageKeys(cr.page_access);
    }
  }

  // ── 2. page access ────────────────────────────────────────────────────────
  let pageAccess = asPageKeys(member.page_access) ?? customRolePages;
  if (pageAccess === null && role === 'agent') {
    const { data: ws } = await db
      .from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
    const settings = (ws?.settings ?? {}) as Record<string, unknown>;
    pageAccess = asPageKeys(settings['agent_page_access']) ?? [...DEFAULT_AGENT_ALLOWED_PAGES];
  }

  // ── 3 + 4. page grants, then per-member overrides ─────────────────────────
  const effective = new Set<Permission>(base);
  for (const key of pageAccess ?? []) {
    for (const p of AGENT_PAGE_PERMISSIONS[key] ?? []) effective.add(p);
  }

  const overrides = (member.permission_overrides ?? {}) as Record<string, unknown>;
  for (const p of asPermissions(overrides['grant']))  effective.add(p);
  for (const p of asPermissions(overrides['revoke'])) effective.delete(p);

  return {
    memberId: member.id as string,
    role,
    customRoleName,
    isSuspended: Boolean(member.is_suspended),
    permissions: member.is_suspended ? [] : [...effective],
    pageAccess,
  };
}

/** May this member open the given page? Unrestricted members always may. */
export function canOpenPage(access: MemberAccess, pageKey: AgentPageKey): boolean {
  if (access.isSuspended) return false;
  if (access.pageAccess === null) return true;
  return access.pageAccess.includes(pageKey);
}

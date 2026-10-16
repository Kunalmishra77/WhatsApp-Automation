import type { Database } from '@/types/database.types';
import type { Permission } from '@/types/auth.types';
import type { AgentPageKey } from '@/lib/agent-pages';

type UserRole = Database['public']['Tables']['workspace_members']['Row']['role'];

export interface TeamMember {
  member_id:   string;
  user_id:     string;
  role:        UserRole;
  is_online:   boolean;
  max_chats:   number;
  joined_at:   string;
  full_name:   string;
  email:       string;
  avatar_url:  string | null;
  /** Job title, shown next to the name. */
  title:            string | null;
  is_suspended:     boolean;
  last_active_at:   string | null;
  custom_role_id:   string | null;
  custom_role_name: string | null;
  /** null = this member is not page-restricted. */
  page_access:      AgentPageKey[] | null;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  manager:     'Manager',
  agent:       'Agent',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-100 text-red-700',
  admin:       'bg-violet-100 text-violet-700',
  manager:     'bg-brand-100 text-brand-700',
  agent:       'bg-gray-100 text-gray-600',
};

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? fallback);
  }
  return res.json() as Promise<T>;
}

// Served by /api/team/members rather than a direct Supabase query, because the
// row now carries a joined custom-role name that RLS-scoped client queries
// cannot resolve on their own.
export async function fetchTeamMembers(workspaceId: string): Promise<TeamMember[]> {
  const data = await jsonOrThrow<{ members: Array<Record<string, unknown>> }>(
    await fetch(`/api/team/members?workspaceId=${workspaceId}`),
    'Failed to load team members',
  );

  return data.members.map((m) => ({
    member_id:        m['id'] as string,
    user_id:          m['user_id'] as string,
    role:             m['role'] as UserRole,
    is_online:        Boolean(m['is_online']),
    max_chats:        (m['max_chats'] as number | null) ?? 0,
    joined_at:        (m['joined_at'] as string | null) ?? new Date().toISOString(),
    full_name:        (m['full_name'] as string | null) ?? 'Unknown',
    email:            (m['email'] as string | null) ?? '',
    avatar_url:       (m['avatar_url'] as string | null) ?? null,
    title:            (m['title'] as string | null) ?? null,
    is_suspended:     Boolean(m['is_suspended']),
    last_active_at:   (m['last_active_at'] as string | null) ?? null,
    custom_role_id:   (m['custom_role_id'] as string | null) ?? null,
    custom_role_name: (m['custom_role_name'] as string | null) ?? null,
    page_access:      (m['page_access'] as AgentPageKey[] | null) ?? null,
  }));
}

/** Everything a member's access is made of. Omitted fields are left untouched. */
export interface MemberPatch {
  role?:         UserRole;
  title?:        string | null;
  customRoleId?: string | null;
  /** Array restricts to those pages; null makes the member unrestricted. */
  pageAccess?:   AgentPageKey[] | null;
  permissionOverrides?: { grant: Permission[]; revoke: Permission[] } | null;
  isSuspended?:  boolean;
}

export async function updateMember(
  memberId: string, workspaceId: string, patch: MemberPatch,
): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/team/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, ...patch }),
    }),
    'Failed to update member',
  );
}

export async function updateMemberRole(memberId: string, role: UserRole, workspaceId: string): Promise<void> {
  return updateMember(memberId, workspaceId, { role });
}

export async function removeMember(memberId: string, workspaceId: string): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/team/members/${memberId}?workspaceId=${workspaceId}`, { method: 'DELETE' }),
    'Failed to remove member',
  );
}

// ── Custom roles ───────────────────────────────────────────────────────────

export interface WorkspaceRole {
  id:           string;
  name:         string;
  description:  string | null;
  permissions:  Permission[];
  page_access:  AgentPageKey[] | null;
  member_count: number;
  created_at:   string;
}

export async function fetchRoles(workspaceId: string): Promise<WorkspaceRole[]> {
  const data = await jsonOrThrow<{ roles: WorkspaceRole[] }>(
    await fetch(`/api/team/roles?workspaceId=${workspaceId}`),
    'Failed to load roles',
  );
  return data.roles;
}

export interface RoleInput {
  name:        string;
  description?: string;
  permissions: Permission[];
  pageAccess:  AgentPageKey[] | null;
}

export async function createRole(workspaceId: string, input: RoleInput): Promise<WorkspaceRole> {
  const data = await jsonOrThrow<{ role: WorkspaceRole }>(
    await fetch('/api/team/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, ...input }),
    }),
    'Failed to create role',
  );
  return data.role;
}

export async function updateRole(
  roleId: string, workspaceId: string, input: Partial<RoleInput>,
): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/team/roles/${roleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, ...input }),
    }),
    'Failed to update role',
  );
}

export async function deleteRole(roleId: string, workspaceId: string): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/team/roles/${roleId}?workspaceId=${workspaceId}`, { method: 'DELETE' }),
    'Failed to delete role',
  );
}

// ── Activity trail ─────────────────────────────────────────────────────────

export interface ActivityEntry {
  id:           string;
  action:       string;
  label:        string;
  entity_type:  string;
  entity_id:    string | null;
  entity_label: string | null;
  metadata:     Record<string, unknown> | null;
  ip_address:   string | null;
  created_at:   string;
  actor: { id: string; full_name: string | null; email: string | null; avatar_url: string | null } | null;
}

export interface ActivityFilters {
  actorId?:    string;
  action?:     string;
  entityType?: string;
  from?:       string;
  to?:         string;
  page?:       number;
}

export async function fetchActivity(
  workspaceId: string, filters: ActivityFilters = {},
): Promise<{ entries: ActivityEntry[]; total: number }> {
  const sp = new URLSearchParams({ workspaceId, page: String(filters.page ?? 0), limit: '50' });
  if (filters.actorId)    sp.set('actorId', filters.actorId);
  if (filters.action)     sp.set('action', filters.action);
  if (filters.entityType) sp.set('entityType', filters.entityType);
  if (filters.from)       sp.set('from', filters.from);
  if (filters.to)         sp.set('to', filters.to);

  const data = await jsonOrThrow<{ entries: ActivityEntry[]; meta: { total: number } }>(
    await fetch(`/api/team/activity?${sp}`),
    'Failed to load activity',
  );
  return { entries: data.entries, total: data.meta.total };
}

// ── Member profile ─────────────────────────────────────────────────────────

export interface MemberProfile {
  member: {
    id: string; user_id: string; role: UserRole; title: string | null;
    full_name: string | null; email: string | null; avatar_url: string | null;
    is_online: boolean; is_suspended: boolean;
    joined_at: string | null; last_active_at: string | null; max_chats: number | null;
    custom_role_id: string | null; custom_role_name: string | null;
    page_access: AgentPageKey[] | null;
    permission_overrides: { grant?: Permission[]; revoke?: Permission[] };
  };
  access: { permissions: Permission[]; pageAccess: AgentPageKey[] | null };
  tasks: Array<{
    id: string; title: string; status: string; priority: string;
    due_date: string | null; completed_at: string | null; created_at: string;
    /** Resolved server-side so the page renders purely from its props. */
    overdue: boolean;
  }>;
  clients: Array<{
    id: string; name: string | null; phone: string; company: string | null;
    tags: string[] | null; created_at: string;
  }>;
  conversations: Array<{
    id: string; status: string; last_message_at: string | null;
    contact: { id: string; name: string | null; phone: string } | null;
  }>;
  activity: Array<{
    id: string; action: string; entity_type: string; entity_id: string | null;
    entity_label: string | null; metadata: Record<string, unknown> | null; created_at: string;
  }>;
  stats: {
    tasks_open: number; tasks_done: number; tasks_overdue: number;
    clients: number; conversations: number;
  };
}

export async function fetchMemberProfile(memberId: string, workspaceId: string): Promise<MemberProfile> {
  return jsonOrThrow<MemberProfile>(
    await fetch(`/api/team/members/${memberId}/profile?workspaceId=${workspaceId}`),
    'Failed to load member profile',
  );
}

// ── Client ↔ team link ─────────────────────────────────────────────────────

export async function setContactOwner(
  contactId: string, workspaceId: string, ownerId: string | null,
): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/contacts/${contactId}/owner`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, ownerId }),
    }),
    'Failed to reassign client',
  );
}

// ── Pending invites ────────────────────────────────────────────────────────

export interface PendingInvite {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  expires_at: string;
  created_at: string;
}

export async function fetchPendingInvites(workspaceId: string): Promise<PendingInvite[]> {
  const data = await jsonOrThrow<{ invites: PendingInvite[] }>(
    await fetch(`/api/team/invite?workspaceId=${workspaceId}`),
    'Failed to load pending invites',
  );
  return data.invites;
}

export async function revokeInvite(inviteId: string, workspaceId: string): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/team/invite/${inviteId}?workspaceId=${workspaceId}`, { method: 'DELETE' }),
    'Failed to revoke invite',
  );
}

export async function resendInvite(inviteId: string, workspaceId: string): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/team/invite/${inviteId}?workspaceId=${workspaceId}`, { method: 'POST' }),
    'Failed to resend invite',
  );
}

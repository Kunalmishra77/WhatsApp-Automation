import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

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

export async function fetchTeamMembers(workspaceId: string): Promise<TeamMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, user_id, role, is_online, max_chats, joined_at, profiles(full_name, email, avatar_url)')
    .eq('workspace_id', workspaceId)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string; user_id: string; role: UserRole; is_online: boolean;
    max_chats: number; joined_at: string;
    profiles: { full_name: string; email: string; avatar_url: string | null } | null;
  }>).map((m) => ({
    member_id:  m.id,
    user_id:    m.user_id,
    role:       m.role,
    is_online:  m.is_online,
    max_chats:  m.max_chats,
    joined_at:  m.joined_at,
    full_name:  m.profiles?.full_name ?? 'Unknown',
    email:      m.profiles?.email ?? '',
    avatar_url: m.profiles?.avatar_url ?? null,
  }));
}

export async function updateMemberRole(memberId: string, role: UserRole, workspaceId: string): Promise<void> {
  const res = await fetch(`/api/team/members/${memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, role }),
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? 'Failed to update role');
  }
}

export async function removeMember(memberId: string, workspaceId: string): Promise<void> {
  const res = await fetch(`/api/team/members/${memberId}?workspaceId=${workspaceId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? 'Failed to remove member');
  }
}

export interface PendingInvite {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  expires_at: string;
  created_at: string;
}

export async function fetchPendingInvites(workspaceId: string): Promise<PendingInvite[]> {
  const res = await fetch(`/api/team/invite?workspaceId=${workspaceId}`);
  if (!res.ok) throw new Error('Failed to load pending invites');
  const data = await res.json() as { invites: PendingInvite[] };
  return data.invites;
}

export async function revokeInvite(inviteId: string, workspaceId: string): Promise<void> {
  const res = await fetch(`/api/team/invite/${inviteId}?workspaceId=${workspaceId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to revoke invite');
}

export async function resendInvite(inviteId: string, workspaceId: string): Promise<void> {
  const res = await fetch(`/api/team/invite/${inviteId}?workspaceId=${workspaceId}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to resend invite');
}

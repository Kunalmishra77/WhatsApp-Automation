'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTeamMembers, updateMember, updateMemberRole, removeMember,
  fetchPendingInvites, revokeInvite, resendInvite,
  fetchRoles, createRole, updateRole, deleteRole,
  fetchActivity, fetchMemberProfile, setContactOwner,
} from '../services/team.service';
import type {
  TeamMember, PendingInvite, MemberPatch, WorkspaceRole, RoleInput,
  ActivityFilters, MemberProfile,
} from '../services/team.service';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { Database } from '@/types/database.types';

export function useTeam() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<TeamMember[]>({
    queryKey: ['team', workspaceId],
    queryFn: () => fetchTeamMembers(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  return useMutation({
    mutationFn: ({
      memberId, role,
    }: {
      memberId: string;
      role: Database['public']['Tables']['workspace_members']['Row']['role'];
    }) => updateMemberRole(memberId, role, workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', workspaceId] }),
  });
}

/**
 * Any change to a member's access: title, custom role, page list, permission
 * overrides, suspension. Invalidates the viewer's own resolved access too, since
 * an admin editing themselves should see their nav update immediately.
 */
export function useUpdateMember() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  return useMutation({
    mutationFn: ({ memberId, patch }: { memberId: string; patch: MemberPatch }) =>
      updateMember(memberId, workspaceId, patch),
    onSuccess: (_d, { memberId }) => {
      void queryClient.invalidateQueries({ queryKey: ['team', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['member-profile', memberId] });
      void queryClient.invalidateQueries({ queryKey: ['my-access', workspaceId] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  return useMutation({
    mutationFn: (memberId: string) => removeMember(memberId, workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', workspaceId] }),
  });
}

export function usePendingInvites() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<PendingInvite[]>({
    queryKey: ['team-invites', workspaceId],
    queryFn: () => fetchPendingInvites(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(inviteId, workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-invites', workspaceId] }),
  });
}

export function useResendInvite() {
  return useMutation({
    mutationFn: ({ inviteId, workspaceId }: { inviteId: string; workspaceId: string }) =>
      resendInvite(inviteId, workspaceId),
  });
}

// ── Custom roles ───────────────────────────────────────────────────────────

export function useRoles() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<WorkspaceRole[]>({
    queryKey: ['team-roles', workspaceId],
    queryFn: () => fetchRoles(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  return useMutation({
    mutationFn: (input: RoleInput) => createRole(workspaceId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-roles', workspaceId] }),
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  return useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: Partial<RoleInput> }) =>
      updateRole(roleId, workspaceId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team-roles', workspaceId] });
      // A role's permissions changing can change what the viewer may see.
      void queryClient.invalidateQueries({ queryKey: ['my-access', workspaceId] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  return useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId, workspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team-roles', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['team', workspaceId] });
    },
  });
}

// ── Activity trail ─────────────────────────────────────────────────────────

export function useActivity(filters: ActivityFilters = {}) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['team-activity', workspaceId, filters],
    queryFn: () => fetchActivity(workspaceId!, filters),
    enabled: !!workspaceId,
    staleTime: 15_000,
  });
}

// ── Member profile ─────────────────────────────────────────────────────────

export function useMemberProfile(memberId: string | undefined) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<MemberProfile>({
    queryKey: ['member-profile', memberId, workspaceId],
    queryFn: () => fetchMemberProfile(memberId!, workspaceId!),
    enabled: !!memberId && !!workspaceId,
    staleTime: 30_000,
  });
}

// ── Client ↔ team link ─────────────────────────────────────────────────────

export function useSetContactOwner() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  return useMutation({
    mutationFn: ({ contactId, ownerId }: { contactId: string; ownerId: string | null }) =>
      setContactOwner(contactId, workspaceId, ownerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['member-profile'] });
    },
  });
}

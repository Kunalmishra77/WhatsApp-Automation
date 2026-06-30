'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTeamMembers, updateMemberRole, removeMember,
  fetchPendingInvites, revokeInvite, resendInvite,
} from '../services/team.service';
import type { TeamMember, PendingInvite } from '../services/team.service';
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

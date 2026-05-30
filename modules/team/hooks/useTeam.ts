'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTeamMembers, updateMemberRole } from '../services/team.service';
import type { TeamMember } from '../services/team.service';
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
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({
      memberId, role,
    }: {
      memberId: string;
      role: Database['public']['Tables']['workspace_members']['Row']['role'];
    }) => updateMemberRole(memberId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', workspaceId] }),
  });
}

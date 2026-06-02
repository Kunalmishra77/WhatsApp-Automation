'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCampaigns, createCampaign, updateCampaignStatus, deleteCampaign } from '../services/campaign.service';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAuthStore } from '@/store/auth.store';

export function useCampaigns() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['campaigns', workspaceId],
    queryFn: () => fetchCampaigns(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (payload: Parameters<typeof createCampaign>[2]) =>
      createCampaign(workspaceId!, userId!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] }),
  });
}

export function useUpdateCampaignStatus() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Parameters<typeof updateCampaignStatus>[1] }) =>
      updateCampaignStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] }),
  });
}

export function useRunCampaign() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const res  = await fetch(`/api/campaigns/${campaignId}/run`, { method: 'POST' });
      const data = await res.json() as { success?: boolean; total?: number; sent?: number; failed?: number; error?: string };
      if (!res.ok) throw new Error(data?.error ?? 'Failed to run campaign');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] }),
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (campaignId: string) => deleteCampaign(campaignId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] }),
  });
}

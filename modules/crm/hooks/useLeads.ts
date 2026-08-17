'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchLeadsByStage, createLead, updateLead, updateLeadStage, deleteLead,
  fetchLeadStageHistory, reclassifyLead, reviewLeadConversion,
  LEAD_STAGES,
} from '../services/lead.service';
import type { LeadInsert, LeadStage, LeadUpdate, LeadWithContact } from '../services/lead.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useLeads() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['leads', workspaceId],
    queryFn: () => fetchLeadsByStage(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (payload: Omit<LeadInsert, 'workspace_id'>) =>
      createLead(workspaceId!, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] }),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LeadUpdate }) =>
      updateLead(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] }),
  });
}

export function useMoveLeadStage() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) =>
      updateLeadStage(id, stage),

    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['leads', workspaceId] });
      const previous = queryClient.getQueryData<Record<LeadStage, LeadWithContact[]>>(['leads', workspaceId]);

      queryClient.setQueryData<Record<LeadStage, LeadWithContact[]>>(
        ['leads', workspaceId],
        (old) => {
          if (!old) return old;
          const next = { ...old };
          let moved: LeadWithContact | undefined;
          for (const s of LEAD_STAGES) {
            const idx = next[s].findIndex((l) => l.id === id);
            if (idx !== -1) {
              moved = { ...next[s][idx], stage } as LeadWithContact;
              next[s] = next[s].filter((l) => l.id !== id);
              break;
            }
          }
          if (moved) next[stage] = [moved, ...next[stage]];
          return next;
        },
      );
      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['leads', workspaceId], context.previous);
      }
    },

    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] }),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] }),
  });
}

// Newest-first stage history for the pipeline-history timeline in LeadDetail.
export function useLeadStageHistory(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-stage-history', leadId],
    queryFn: () => fetchLeadStageHistory(leadId!),
    enabled: !!leadId,
  });
}

// On-demand "Re-analyze" for a single lead (bound to the lead already open in
// LeadDetail, mirroring the useLeadStageHistory(leadId) shape above).
export function useReclassifyLead(leadId: string | null) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: () => reclassifyLead(leadId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['lead-stage-history', leadId] });
    },
  });
}

// Confirm/undo an AI-marked conversion for the lead open in LeadDetail.
export function useReviewConversion(leadId: string | null) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (action: 'confirm' | 'undo') => reviewLeadConversion(leadId!, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['lead-stage-history', leadId] });
    },
  });
}

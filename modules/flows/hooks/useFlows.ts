'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFlows, fetchFlow, createFlow, updateFlow, deleteFlow,
} from '../services/flow.service';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { ChatbotFlow } from '../types';

export function useFlows() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['flows', workspaceId],
    queryFn: () => fetchFlows(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useFlow(id: string | null) {
  return useQuery({
    queryKey: ['flow', id],
    queryFn: () => fetchFlow(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateFlow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (name: string) => createFlow(workspaceId!, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows', workspaceId] }),
  });
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ChatbotFlow> }) =>
      updateFlow(id, patch),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flows', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['flow', data.id] });
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteFlow(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows', workspaceId] }),
  });
}

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';

export interface SequenceStep {
  delay_hours: number;
  message: string;
}

export interface FollowUpSequence {
  id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  steps: SequenceStep[];
  created_at: string;
}

export type CreateSequencePayload = {
  name: string;
  steps: SequenceStep[];
};

export type UpdateSequencePayload = Partial<{
  name: string;
  is_active: boolean;
  steps: SequenceStep[];
}>;

async function fetchSequences(workspaceId: string): Promise<FollowUpSequence[]> {
  const res = await fetch(`/api/sequences?workspaceId=${workspaceId}`);
  const data = await res.json() as { sequences?: FollowUpSequence[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to fetch sequences');
  return data.sequences ?? [];
}

async function createSequence(workspaceId: string, payload: CreateSequencePayload): Promise<FollowUpSequence> {
  const res = await fetch('/api/sequences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, workspaceId }),
  });
  const data = await res.json() as { sequence?: FollowUpSequence; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to create sequence');
  return data.sequence!;
}

async function updateSequence(id: string, payload: UpdateSequencePayload): Promise<FollowUpSequence> {
  const res = await fetch(`/api/sequences/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json() as { sequence?: FollowUpSequence; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to update sequence');
  return data.sequence!;
}

async function deleteSequence(id: string): Promise<void> {
  const res = await fetch(`/api/sequences/${id}`, { method: 'DELETE' });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to delete sequence');
}

export function useSequences() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['sequences', workspaceId],
    queryFn: () => fetchSequences(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useCreateSequence() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (payload: CreateSequencePayload) => createSequence(workspaceId!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences', workspaceId] }),
  });
}

export function useUpdateSequence() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateSequencePayload }) =>
      updateSequence(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences', workspaceId] }),
  });
}

export function useDeleteSequence() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteSequence(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences', workspaceId] }),
  });
}

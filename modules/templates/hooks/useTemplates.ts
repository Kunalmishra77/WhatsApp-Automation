'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  fetchTemplates, createTemplate, updateTemplate, deleteTemplate,
} from '../services/template.service';
import type { TemplateInsert, TemplateUpdate } from '../services/template.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useTemplates() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  // Auto-sync template statuses from Meta on first page load (silent background call)
  useEffect(() => {
    if (!workspaceId) return;
    fetch('/api/templates/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }))
      .catch(() => {}); // fail silently — user can manually sync
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return useQuery({
    queryKey: ['templates', workspaceId],
    queryFn: () => fetchTemplates(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (p: Omit<TemplateInsert, 'workspace_id'>) => createTemplate(workspaceId!, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TemplateUpdate }) => updateTemplate(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }),
  });
}

export function useSubmitTemplate() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/templates/${id}/submit`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Submit failed');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }),
  });
}

export function useSyncTemplates() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/templates/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Sync failed');
      return data as { total: number; new: number; updated: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }),
  });
}

'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  created_by: string | null;
  related_contact_id: string | null;
  related_conversation_id: string | null;
  created_at: string;
  assignee?: { full_name: string | null; email: string | null } | null;
  creator?: { full_name: string | null; email: string | null } | null;
  contact?: { name: string | null; phone: string | null } | null;
}

export function useTasks(assignedTo?: string) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<Task[]>({
    queryKey: ['tasks', workspaceId, assignedTo ?? 'all'],
    queryFn: async () => {
      const p = new URLSearchParams({ workspaceId: workspaceId! });
      if (assignedTo) p.set('assignedTo', assignedTo);
      const res = await fetch(`/api/tasks?${p.toString()}`);
      if (!res.ok) throw new Error('Failed to load tasks');
      return (await res.json()).tasks ?? [];
    },
    enabled: !!workspaceId,
    staleTime: 15_000,
  });
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assigned_to?: string | null;
  priority?: string;
  due_date?: string | null;
  related_contact_id?: string | null;
  related_conversation_id?: string | null;
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });

  const create = useMutation({
    mutationFn: async (body: CreateTaskInput) => {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, workspaceId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create task');
      return res.json();
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to update task');
      return res.json();
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete task');
      return res.json();
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

export function useTeamMembers() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<Array<{ user_id: string; full_name: string | null; email: string | null }>>({
    queryKey: ['team-members', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/team/members?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error('Failed to load team');
      return (await res.json()).members ?? [];
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

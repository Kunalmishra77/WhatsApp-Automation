'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';

export interface RuleAction {
  type: 'label' | 'assign' | 'status' | 'auto_reply' | 'tag_contact';
  value: string;
}

export interface InboxRule {
  id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  trigger_type: 'keyword' | 'first_message' | 'any_message';
  trigger_value: {
    keywords?: string[];
    match?: 'any' | 'all';
  };
  actions: RuleAction[];
  priority: number;
  created_at: string;
  updated_at: string;
}

export type CreateInboxRulePayload = Omit<InboxRule, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>;
export type UpdateInboxRulePayload = Partial<CreateInboxRulePayload>;

async function fetchRules(workspaceId: string): Promise<InboxRule[]> {
  const res = await fetch(`/api/inbox-rules?workspaceId=${workspaceId}`);
  const data = await res.json() as { rules?: InboxRule[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to fetch rules');
  return data.rules ?? [];
}

async function createRule(workspaceId: string, payload: CreateInboxRulePayload): Promise<InboxRule> {
  const res = await fetch('/api/inbox-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, workspaceId }),
  });
  const data = await res.json() as { rule?: InboxRule; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to create rule');
  return data.rule!;
}

async function updateRule(id: string, payload: UpdateInboxRulePayload): Promise<InboxRule> {
  const res = await fetch(`/api/inbox-rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json() as { rule?: InboxRule; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to update rule');
  return data.rule!;
}

async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`/api/inbox-rules/${id}`, { method: 'DELETE' });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to delete rule');
}

export function useInboxRules() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['inbox-rules', workspaceId],
    queryFn: () => fetchRules(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useCreateInboxRule() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (payload: CreateInboxRulePayload) => createRule(workspaceId!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox-rules', workspaceId] }),
  });
}

export function useUpdateInboxRule() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateInboxRulePayload }) =>
      updateRule(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox-rules', workspaceId] }),
  });
}

export function useDeleteInboxRule() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox-rules', workspaceId] }),
  });
}

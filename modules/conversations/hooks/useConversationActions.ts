'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';

// ─── Types ─────────────────────────────────────────────────────────────────

type ConversationStatus = 'open' | 'resolved' | 'pending' | 'snoozed';

interface AssignAgentPayload {
  conversationId: string;
  agentId: string | null;
}

interface ChangeStatusPayload {
  conversationId: string;
  status: ConversationStatus;
}

// ─── useAssignAgent ─────────────────────────────────────────────────────────

export function useAssignAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, agentId }: AssignAgentPayload) => {
      const res = await fetch(`/api/conversations/${conversationId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to assign agent');
      }

      return res.json();
    },
    onSuccess: (_data, { conversationId }) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
}

// ─── useResolveConversation ─────────────────────────────────────────────────

export function useResolveConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch(`/api/conversations/${conversationId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to resolve conversation');
      }

      return res.json();
    },
    onSuccess: (_data, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
}

// ─── useChangeStatus ────────────────────────────────────────────────────────

export function useChangeStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, status }: ChangeStatusPayload) => {
      const res = await fetch(`/api/conversations/${conversationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to change status');
      }

      return res.json();
    },
    onSuccess: (_data, { conversationId }) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
}

// ─── useBotPause ────────────────────────────────────────────────────────────

export function useBotPause() {
  const queryClient  = useQueryClient();
  const workspaceId  = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';

  return useMutation({
    mutationFn: async ({ conversationId, paused }: { conversationId: string; paused: boolean }) => {
      const res = await fetch(`/api/conversations/${conversationId}/bot-pause`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, paused }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to toggle bot pause');
      }

      return res.json() as Promise<{ id: string; bot_paused: boolean }>;
    },
    onSuccess: (_data, { conversationId }) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
}

// ─── useSummarize ────────────────────────────────────────────────────────────

export function useSummarize() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';

  return useMutation({
    mutationFn: async (conversationId: string): Promise<{ summary: string }> => {
      const res = await fetch(`/api/conversations/${conversationId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to summarize');
      }

      return res.json() as Promise<{ summary: string }>;
    },
  });
}

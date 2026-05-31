'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

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

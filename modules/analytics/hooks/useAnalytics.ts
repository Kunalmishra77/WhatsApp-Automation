'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchConversationStats,
  fetchDailyConversations,
  fetchMessageFunnel,
} from '../services/analytics.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useConversationStats() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['analytics', 'conv-stats', workspaceId],
    queryFn: () => fetchConversationStats(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  });
}

export function useDailyConversations(days = 14) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['analytics', 'daily-convs', workspaceId, days],
    queryFn: () => fetchDailyConversations(workspaceId!, days),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  });
}

export function useMessageFunnel() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['analytics', 'msg-funnel', workspaceId],
    queryFn: () => fetchMessageFunnel(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  });
}

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

// ── New overview hook ──────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalMessages: number;
  totalInbound: number;
  totalOutbound: number;
  deliveryRate: number;
  avgResponseTimeMin: number;
  openConversations: number;
  resolvedConversations: number;
  totalContacts: number;
  newContacts: number;
}

export interface DailyMessage {
  date: string;
  inbound: number;
  outbound: number;
  delivered: number;
}

export interface SenderBreakdown {
  type: string;
  count: number;
}

export interface TopContact {
  name: string | null;
  phone: string;
  messageCount: number;
}

export interface ConversationStatus {
  status: string;
  count: number;
}

export interface AnalyticsOverview {
  summary: AnalyticsSummary;
  dailyMessages: DailyMessage[];
  senderBreakdown: SenderBreakdown[];
  topContacts: TopContact[];
  conversationsByStatus: ConversationStatus[];
}

export function useAnalyticsOverview(from: string, to: string) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<AnalyticsOverview>({
    queryKey: ['analytics', 'overview', workspaceId, from, to],
    queryFn: () =>
      fetch(
        `/api/analytics/overview?workspaceId=${workspaceId}&from=${from}&to=${to}`,
      ).then((r) => {
        if (!r.ok) throw new Error('Failed to fetch analytics');
        return r.json() as Promise<AnalyticsOverview>;
      }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

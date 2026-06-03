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

// ── Types ──────────────────────────────────────────────────────────────────────

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
  csatAvgScore: number | null;
  csatResponseCount: number;
}

export interface DailyMessage {
  date: string;
  inbound: number;
  outbound: number;
  delivered: number;
  newContacts: number;
}

export interface SenderBreakdown  { type: string;  count: number; }
export interface TopContact       { id: string; name: string | null; phone: string; messageCount: number; }
export interface ConversationStatus { status: string; count: number; }
export interface ResolutionBucket { label: string; count: number; }
export interface TagItem          { tag: string; count: number; }

export interface AnalyticsOverview {
  summary: AnalyticsSummary;
  dailyMessages: DailyMessage[];
  senderBreakdown: SenderBreakdown[];
  topContacts: TopContact[];
  conversationsByStatus: ConversationStatus[];
  resolutionTimeDistribution: ResolutionBucket[];
  tagDistribution: TagItem[];
  hourlyHeatmap: number[][];
}

export function useAnalyticsOverview(from: string, to: string) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<AnalyticsOverview>({
    queryKey: ['analytics', 'overview', workspaceId, from, to],
    queryFn: () =>
      fetch(`/api/analytics/overview?workspaceId=${workspaceId}&from=${from}&to=${to}`)
        .then((r) => {
          if (!r.ok) throw new Error('Failed to fetch analytics');
          return r.json() as Promise<AnalyticsOverview>;
        }),
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

// ── Agent performance ──────────────────────────────────────────────────────────

export interface AgentStat {
  agentId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  totalAssigned: number;
  resolved: number;
  avgFirstResponseMin: number;
  csatAvgScore: number | null;
  messagesSent: number;
}

export interface AgentPerformanceResponse { agents: AgentStat[]; }

export function useAgentPerformance(from: string, to: string) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<AgentPerformanceResponse>({
    queryKey: ['analytics', 'agents', workspaceId, from, to],
    queryFn: () =>
      fetch(`/api/analytics/agents?workspaceId=${workspaceId}&from=${from}&to=${to}`)
        .then((r) => {
          if (!r.ok) throw new Error('Failed to fetch agent performance');
          return r.json() as Promise<AgentPerformanceResponse>;
        }),
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

// ── Extended analytics (campaigns, leads, sentiment, flows) ──────────────────

export interface ExtendedAnalytics {
  campaignSummary:              { total: number; completed: number; running: number; failed: number; draft: number; totalSent: number };
  campaignStats:                Array<{ id: string; name: string; template: string; status: string; total: number; delivered: number; read: number; failed: number; deliveryRate: number; readRate: number; abGroup: string | null; createdAt: string }>;
  leadFunnel:                   Array<{ stage: string; count: number }>;
  leadTemperature:              Array<{ label: string; value: number; color: string }>;
  avgAiScore:                   number | null;
  totalLeads:                   number;
  sentimentBreakdown:           Array<{ label: string; value: number; color: string }>;
  sentimentTrend:               Array<{ date: string; positive: number; neutral: number; negative: number }>;
  contactTemperatureBreakdown:  Array<{ label: string; value: number; color: string }>;
  flowStats:                    Array<{ id: string; name: string; isActive: boolean; nodeCount: number; sessions: number; completed: number; completionRate: number }>;
  deliveryFunnel:               Array<{ stage: string; count: number; color: string }>;
}

export function useExtendedAnalytics(from: string, to: string) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<ExtendedAnalytics>({
    queryKey: ['analytics', 'extended', workspaceId, from, to],
    queryFn: () =>
      fetch(`/api/analytics/extended?workspaceId=${workspaceId}&from=${from}&to=${to}`)
        .then((r) => {
          if (!r.ok) throw new Error('Failed to fetch extended analytics');
          return r.json() as Promise<ExtendedAnalytics>;
        }),
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

// ── Detail drawer ──────────────────────────────────────────────────────────────

export type DrawerType =
  | 'open' | 'resolved' | 'pending' | 'assigned'
  | 'new-contacts' | 'csat'
  | 'inbound' | 'outbound' | 'delivery';

export function useAnalyticsDetail(type: DrawerType | null, from: string, to: string) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<{ rows: unknown[]; buckets?: Record<string, number> }>({
    queryKey: ['analytics', 'detail', workspaceId, type, from, to],
    queryFn: () =>
      fetch(`/api/analytics/detail?workspaceId=${workspaceId}&type=${type}&from=${from}&to=${to}`)
        .then((r) => r.json() as Promise<{ rows: unknown[]; buckets?: Record<string, number> }>),
    enabled: !!workspaceId && !!type,
    staleTime: 30_000,
  });
}

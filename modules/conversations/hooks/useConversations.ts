'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { createClient } from '@/services/supabase/client';
import { searchConversations } from '../services/conversation.service';
import type {
  ConversationSearchFilters,
  ConversationSearchSummary,
  ConversationWithContact,
} from '../services/conversation.service';
import { useWorkspaceStore } from '@/store/workspace.store';

const PAGE_SIZE = 30;

// Filters the caller controls — workspaceId/limit/offset are injected by this hook.
export type ConversationQueryFilters = Omit<ConversationSearchFilters, 'workspaceId' | 'limit' | 'offset'>;

// Server-side conversation search, paginated via limit/offset + `total` ("Load more").
// Replaces the old direct-browser-supabase fetchConversations() query — filtering
// (status/channel tabs + the full filter bar) now happens in /api/conversations/search
// so counts stay exact past PostgREST's 1000-row default cap. Realtime subscriptions
// still invalidate the query on any conversation/message change for this workspace.
export function useConversations(filters: ConversationQueryFilters) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['conversations', workspaceId, filters],
    queryFn: ({ pageParam }) =>
      searchConversations({
        ...filters,
        workspaceId: workspaceId!,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.conversations.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!workspaceId,
    staleTime: 30_000,            // 30s — realtime subscriptions handle live updates
    refetchInterval: 60_000,      // 60s fallback only (realtime is primary)
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] });
    };

    const channel = supabase
      .channel(`conversations-list:${workspaceId}`)
      // Conversation row changes (status, unread_count, last_message_at)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversations',
        filter: `workspace_id=eq.${workspaceId}`,
      }, refresh)
      // New inbound message — refresh list immediately
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `workspace_id=eq.${workspaceId}`,
      }, refresh)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[useConversations] realtime channel ${status} for workspace ${workspaceId}`);
          refresh();
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, queryClient]);

  const conversations = useMemo<ConversationWithContact[]>(
    () => query.data?.pages.flatMap((page) => page.conversations) ?? [],
    [query.data],
  );
  const total: number = query.data?.pages[0]?.total ?? 0;
  const summary: ConversationSearchSummary | undefined = query.data?.pages[0]?.summary;

  return {
    ...query,
    conversations,
    total,
    summary,
  };
}

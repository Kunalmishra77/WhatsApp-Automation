'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClient } from '@/services/supabase/client';
import { fetchConversations } from '../services/conversation.service';
import type { ConversationWithContact } from '../services/conversation.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useConversations(status = 'all', channel = 'all') {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const queryClient = useQueryClient();

  const query = useQuery<ConversationWithContact[]>({
    queryKey: ['conversations', workspaceId, status, channel],
    queryFn: () => fetchConversations(workspaceId!, status, channel),
    enabled: !!workspaceId,
    staleTime: 0,
    refetchInterval: 4000,        // Poll every 4s — ensures list always fresh
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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, queryClient]);

  return query;
}

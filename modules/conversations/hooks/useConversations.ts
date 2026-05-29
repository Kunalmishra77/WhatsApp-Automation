'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClient } from '@/services/supabase/client';
import { fetchConversations } from '../services/conversation.service';
import type { ConversationWithContact } from '../services/conversation.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useConversations(status = 'all') {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const queryClient = useQueryClient();

  const query = useQuery<ConversationWithContact[]>({
    queryKey: ['conversations', workspaceId, status],
    queryFn: () => fetchConversations(workspaceId!, status),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`conversations-list:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, queryClient]);

  return query;
}

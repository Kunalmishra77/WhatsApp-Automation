'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClient } from '@/services/supabase/client';
import { fetchMessages, sendMessage, sendInternalNote } from '../services/message.service';
import type { MessageRow } from '../services/message.service';
import { useConversationStore } from '@/store/conversation.store';
import { useAuthStore } from '@/store/auth.store';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useMessages(conversationId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<MessageRow[]>({
    queryKey: ['messages', conversationId],
    queryFn: () => fetchMessages(conversationId),
    enabled: !!conversationId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as MessageRow;
          queryClient.setQueryData<MessageRow[]>(
            ['messages', conversationId],
            (old = []) => {
              if (old.some((m) => m.id === newMsg.id)) return old;
              return [...old, newMsg];
            },
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  return query;
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  return async (conversationId: string, content: string, isNote = false) => {
    if (!user || !workspaceId) return;

    const optimistic: MessageRow = {
      id: `opt-${Date.now()}`,
      conversation_id: conversationId,
      workspace_id: workspaceId,
      sender_type: 'agent',
      sender_id: user.id,
      direction: 'outbound',
      type: isNote ? 'internal_note' : 'text',
      content,
      status: 'queued',
      is_deleted: false,
      reply_to_id: null,
      media_url: null,
      media_mime_type: null,
      media_size: null,
      media_filename: null,
      caption: null,
      whatsapp_msg_id: null,
      reactions: {},
      metadata: {},
      delivered_at: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    queryClient.setQueryData<MessageRow[]>(
      ['messages', conversationId],
      (old = []) => [...old, optimistic],
    );

    try {
      const fn = isNote ? sendInternalNote : sendMessage;
      await fn({ conversationId, workspaceId, senderId: user.id, content });
    } catch {
      queryClient.setQueryData<MessageRow[]>(
        ['messages', conversationId],
        (old = []) => old.filter((m) => m.id !== optimistic.id),
      );
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    }
  };
}

export function useTypingBroadcast(conversationId: string) {
  const setTyping = useConversationStore((s) => s.setTyping);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!conversationId || !user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { user_id, is_typing } = payload.payload as { user_id: string; is_typing: boolean };
        if (user_id !== user.id) {
          setTyping(user_id, conversationId, is_typing);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user, setTyping]);

  const broadcastTyping = async (isTyping: boolean) => {
    if (!user) return;
    const supabase = createClient();
    await supabase.channel(`typing:${conversationId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user.id, is_typing: isTyping },
    });
  };

  return { broadcastTyping };
}

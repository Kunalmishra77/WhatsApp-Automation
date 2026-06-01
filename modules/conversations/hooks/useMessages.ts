'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClient } from '@/services/supabase/client';
import { fetchMessages, sendInternalNote } from '../services/message.service';
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
    refetchInterval: 3000,        // Poll every 3s as realtime fallback
    refetchIntervalInBackground: false,
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

    // Optimistic update — show message immediately in UI
    const optimisticId = `opt-${Date.now()}`;
    const optimistic: MessageRow = {
      id: optimisticId,
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
      if (isNote) {
        // Internal notes — DB only, no WhatsApp
        await sendInternalNote({ conversationId, workspaceId, senderId: user.id, content });
      } else {
        // Real WhatsApp message — call send API
        const res = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, content }),
        });
        if (!res.ok) {
          const err = await res.json();
          console.error('[useSendMessage] API error:', err);
          throw new Error(err?.error ?? 'Send failed');
        }
      }
    } catch (e) {
      console.error('[useSendMessage] Failed:', e);
      // Remove optimistic message on failure
      queryClient.setQueryData<MessageRow[]>(
        ['messages', conversationId],
        (old = []) => old.filter((m) => m.id !== optimisticId),
      );
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    }
  };
}

export function useSuggestedReplies(conversationId: string) {
  // Unused but required by the useMutation signature expectations
  const _queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/suggest-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      const data = await res.json() as { suggestions?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to get suggestions');
      return data.suggestions ?? [];
    },
  });
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

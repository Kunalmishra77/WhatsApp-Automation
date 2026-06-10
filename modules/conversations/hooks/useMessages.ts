'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClient } from '@/services/supabase/client';
import { fetchMessages, sendInternalNote } from '../services/message.service';
import { toast } from 'sonner';
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
      // New inbound/outbound message
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as MessageRow;
          queryClient.setQueryData<MessageRow[]>(
            ['messages', conversationId],
            (old = []) => old.some((m) => m.id === newMsg.id) ? old : [...old, newMsg],
          );
        },
      )
      // Status updates: queued → sent → delivered → read
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const updated = payload.new as MessageRow;
          queryClient.setQueryData<MessageRow[]>(
            ['messages', conversationId],
            (old = []) => old.map((m) => m.id === updated.id ? { ...m, ...updated } : m),
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

  return async (conversationId: string, content: string, isNote = false): Promise<boolean> => {
    if (!user || !workspaceId) return false;

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
        await sendInternalNote({ conversationId, workspaceId, senderId: user.id, content });
      } else {
        const res = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, content }),
        });
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          throw new Error(err?.error ?? 'Failed to send message');
        }
      }
      return true;
    } catch (e) {
      console.error('[useSendMessage] Failed:', e);
      queryClient.setQueryData<MessageRow[]>(
        ['messages', conversationId],
        (old = []) => old.filter((m) => m.id !== optimisticId),
      );
      const msg = e instanceof Error ? e.message : 'Failed to send message';
      // Friendly hint for WhatsApp 24-hour session restriction
      if (msg.includes('131047') || msg.toLowerCase().includes('re-engagement') || msg.toLowerCase().includes('outside')) {
        toast.error('Cannot send — customer must reply first to open a 24-hour chat window.');
      } else {
        toast.error(msg);
      }
      return false;
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

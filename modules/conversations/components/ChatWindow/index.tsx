'use client';

import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageBubble } from '../MessageBubble';
import { TypingIndicator } from '../TypingIndicator';
import { MessageInput } from '../MessageInput';
import { ConversationHeader } from '../ConversationHeader';
import { useMessages } from '../../hooks/useMessages';
import { useQuery } from '@tanstack/react-query';
import { fetchConversation, markConversationRead } from '../../services/conversation.service';
import { useConversationStore } from '@/store/conversation.store';
import { useWorkspaceStore } from '@/store/workspace.store';

interface ChatWindowProps {
  conversationId: string;
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const typingUsers = useConversationStore(
    useShallow((s) => s.typingUsers.filter((t) => t.conversation_id === conversationId)),
  );

  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversation(conversationId),
    enabled: !!conversationId,
  });

  const { data: messages = [], isLoading } = useMessages(conversationId);

  // Mark as read when conversation opened AND whenever new messages arrive while open
  useEffect(() => {
    if (!conversationId) return;
    void markConversationRead(conversationId);
  }, [conversationId, messages.length]); // re-run when new messages arrive

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!conversation) return null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ConversationHeader conversation={conversation} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <Skeleton className="h-12 w-52 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} conversationId={conversationId} />
            ))}
            {typingUsers.length > 0 && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <MessageInput conversationId={conversationId} />
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageBubble } from '../MessageBubble';
import { TypingIndicator } from '../TypingIndicator';
import { MessageInput } from '../MessageInput';
import { ConversationHeader } from '../ConversationHeader';
import { useMessages } from '../../hooks/useMessages';
import { useQuery } from '@tanstack/react-query';
import { fetchConversation } from '../../services/conversation.service';
import { useConversationStore } from '@/store/conversation.store';

interface ChatWindowProps {
  conversationId: string;
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingUsers = useConversationStore((s) =>
    s.typingUsers.filter((t) => t.conversation_id === conversationId),
  );

  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversation(conversationId),
    enabled: !!conversationId,
  });

  const { data: messages = [], isLoading } = useMessages(conversationId);

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
              <MessageBubble key={msg.id} message={msg} />
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

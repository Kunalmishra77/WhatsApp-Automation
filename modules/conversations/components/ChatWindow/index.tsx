'use client';

import { useEffect, useRef, useMemo } from 'react';
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
  panelToggle?: React.ReactNode;
}

export function ChatWindow({ conversationId, panelToggle }: ChatWindowProps) {
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

  // WhatsApp 24-hour session: check if last inbound message was within 24 hrs
  const sessionOpen = useMemo(() => {
    const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
    if (!lastInbound) return false;
    return Date.now() - new Date(lastInbound.created_at).getTime() < 24 * 60 * 60 * 1000;
  }, [messages]);

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
      <ConversationHeader conversation={conversation} panelToggle={panelToggle} />

      {/* WhatsApp 24-hour session warning */}
      {!isLoading && !sessionOpen && (
        <div className="shrink-0 flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
          <span className="text-amber-500 text-sm leading-none mt-0.5">⚠️</span>
          <p className="text-xs text-amber-800 leading-relaxed">
            {messages.length === 0
              ? <><strong>New conversation.</strong> Use a WhatsApp template to send the first message — free-form messages require the customer to reply first.</>
              : <><strong>Session window closed.</strong> The customer hasn&apos;t replied in 24+ hours. Send a template to re-open the chat window.</>}
          </p>
        </div>
      )}

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

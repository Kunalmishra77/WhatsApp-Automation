'use client';

import { ConversationList } from '@/modules/conversations/components/ConversationList';
import { ChatWindow } from '@/modules/conversations/components/ChatWindow';
import { CustomerPanel } from '@/modules/conversations/components/CustomerPanel';
import { useConversationStore } from '@/store/conversation.store';
import { MessageSquare } from 'lucide-react';

export default function ConversationsPage() {
  const activeId = useConversationStore((s) => s.activeConversationId);

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationList />

      {activeId ? (
        <ChatWindow conversationId={activeId} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10">
            <MessageSquare className="h-7 w-7 text-brand-500" />
          </div>
          <p className="text-base font-medium text-foreground">Select a conversation</p>
          <p className="text-sm text-muted-foreground">
            Choose from the list to start chatting.
          </p>
        </div>
      )}

      {activeId && (
        <div className="hidden xl:flex">
          <CustomerPanel conversationId={activeId} />
        </div>
      )}
    </div>
  );
}

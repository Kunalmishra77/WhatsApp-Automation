'use client';

import { use, useEffect } from 'react';
import { useConversationStore } from '@/store/conversation.store';
import { ChatWindow } from '@/modules/conversations/components/ChatWindow';

export default function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const setActive = useConversationStore((s) => s.setActiveConversation);

  useEffect(() => {
    setActive(id);
    return () => setActive(null);
  }, [id, setActive]);

  return <ChatWindow conversationId={id} />;
}

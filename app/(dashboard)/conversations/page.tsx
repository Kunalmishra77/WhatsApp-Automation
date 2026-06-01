'use client';

import { useState } from 'react';
import { ConversationList } from '@/modules/conversations/components/ConversationList';
import { ChatWindow } from '@/modules/conversations/components/ChatWindow';
import { CustomerPanel } from '@/modules/conversations/components/CustomerPanel';
import { useConversationStore } from '@/store/conversation.store';
import { MessageSquare, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function ConversationsPage() {
  const activeId = useConversationStore((s) => s.activeConversationId);
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <TooltipProvider>
      <div className="flex h-full overflow-hidden">
        <ConversationList />

        {activeId ? (
          <ChatWindow
            conversationId={activeId}
            panelToggle={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPanelOpen((v) => !v)}
                  >
                    {panelOpen
                      ? <PanelRightClose className="h-4 w-4" />
                      : <PanelRightOpen  className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {panelOpen ? 'Hide contact panel' : 'Show contact panel'}
                </TooltipContent>
              </Tooltip>
            }
          />
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

        {activeId && panelOpen && (
          <CustomerPanel conversationId={activeId} />
        )}
      </div>
    </TooltipProvider>
  );
}

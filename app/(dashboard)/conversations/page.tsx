'use client';

import { useState } from 'react';
import { ConversationList } from '@/modules/conversations/components/ConversationList';
import { ChatWindow } from '@/modules/conversations/components/ChatWindow';
import { CustomerPanel } from '@/modules/conversations/components/CustomerPanel';
import { QuickStartChecklist } from '@/modules/onboarding/components/QuickStartChecklist';
import { useConversationStore } from '@/store/conversation.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { MessageSquare, PanelRightOpen, PanelRightClose, Contact, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function ConversationsPage() {
  const activeId    = useConversationStore((s) => s.activeConversationId);
  const setActive   = useConversationStore((s) => s.setActiveConversation);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [panelOpen, setPanelOpen] = useState(true);              // desktop (lg+) inline contact panel
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false); // mobile (<lg) contact slide-over

  // Two CSS-gated toggles share one header slot: the desktop control flips the
  // inline panel; the mobile control opens the slide-over. Which one is visible is
  // decided purely by breakpoint, so no viewport JS is needed.
  const panelToggle = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-7 w-7 lg:inline-flex"
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

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 lg:hidden"
        onClick={() => setMobilePanelOpen(true)}
        aria-label="Show contact panel"
      >
        <Contact className="h-4 w-4" />
      </Button>
    </>
  );

  return (
    <TooltipProvider>
      <div className="flex h-full overflow-hidden">
        <ConversationList />

        {activeId ? (
          <ChatWindow
            conversationId={activeId}
            onBack={() => setActive(null)}
            panelToggle={panelToggle}
          />
        ) : (
          // On mobile the full-width list stands in for this empty state, so it's
          // desktop-only; on lg it fills the middle pane exactly as before.
          <div className="hidden flex-1 flex-col items-center justify-center gap-6 px-4 lg:flex">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10">
                <MessageSquare className="h-7 w-7 text-brand-500" />
              </div>
              <p className="text-base font-medium text-foreground">Select a conversation</p>
              <p className="text-sm text-muted-foreground">
                Choose from the list to start chatting.
              </p>
            </div>
            {workspaceId && <QuickStartChecklist workspaceId={workspaceId} />}
          </div>
        )}

        {/* Desktop (lg+): inline contact panel */}
        {activeId && panelOpen && (
          <CustomerPanel conversationId={activeId} className="hidden lg:block" />
        )}

        {/* Mobile (<lg): contact panel as a slide-over drawer */}
        {activeId && mobilePanelOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="flex-1 bg-black/40"
              onClick={() => setMobilePanelOpen(false)}
              aria-hidden
            />
            <div className="relative flex h-full w-[85%] max-w-sm flex-col bg-card shadow-xl">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold text-foreground">Contact</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setMobilePanelOpen(false)}
                  aria-label="Close contact panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CustomerPanel conversationId={activeId} className="w-full flex-1 border-l-0" />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

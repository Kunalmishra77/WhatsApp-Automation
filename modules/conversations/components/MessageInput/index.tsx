'use client';

import { useState, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, StickyNote, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSendMessage, useTypingBroadcast } from '../../hooks/useMessages';
import { InteractiveMessageBuilder } from '../InteractiveMessageBuilder';

interface MessageInputProps {
  conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
  const [text, setText] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isInteractiveOpen, setIsInteractiveOpen] = useState(false);
  const sendMessage = useSendMessage();
  const { broadcastTyping } = useTypingBroadcast(conversationId);
  const isTypingRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stopTyping = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      void broadcastTyping(false);
    }
  }, [broadcastTyping]);

  const scheduleStopTyping = useCallback(() => {
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(stopTyping, 2000);
  }, [stopTyping]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      void broadcastTyping(true);
    }
    scheduleStopTyping();
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    clearTimeout(stopTimerRef.current);
    stopTyping();
    await sendMessage(conversationId, trimmed, isNote);
    setText('');
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          'shrink-0 border-t border-border bg-card px-4 py-3',
          isNote && 'bg-amber-50/50 border-amber-200',
        )}
      >
        {isNote && (
          <p className="mb-2 text-xs font-medium text-amber-700">
            Internal note — not sent to customer
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={isNote ? 'Add an internal note…' : 'Type a message… (Enter to send)'}
            className={cn(
              'min-h-[40px] max-h-32 flex-1 resize-none text-sm',
              isNote && 'border-amber-200 focus-visible:ring-amber-400',
            )}
            rows={1}
          />
          <div className="flex items-center gap-1.5 pb-0.5">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-8 w-8', isNote && 'text-amber-600')}
                  onClick={() => setIsNote((n) => !n)}
                >
                  <StickyNote className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Toggle internal note</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsInteractiveOpen(true)}
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Send interactive message</TooltipContent>
            </Tooltip>

            <Button
              size="icon"
              className="h-8 w-8 bg-brand-500 hover:bg-brand-600"
              onClick={() => void handleSend()}
              disabled={!text.trim() || isSending}
            >
              <Send className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>
      </div>
      <InteractiveMessageBuilder
        open={isInteractiveOpen}
        onClose={() => setIsInteractiveOpen(false)}
        conversationId={conversationId}
      />
    </TooltipProvider>
  );
}

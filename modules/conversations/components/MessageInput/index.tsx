'use client';

import { useState, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, StickyNote, LayoutList, IndianRupee } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
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
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDescription, setPayDescription] = useState('');
  const [payCurrency, setPayCurrency] = useState('INR');
  const [isSendingPayment, setIsSendingPayment] = useState(false);
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

  const handleSendPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!payDescription.trim()) { toast.error('Description is required'); return; }
    setIsSendingPayment(true);
    try {
      const res = await fetch('/api/payments/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          amount,
          currency: payCurrency,
          description: payDescription.trim(),
        }),
      });
      const data = await res.json() as { paymentUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to create payment link');
      toast.success('Payment link sent!');
      setIsPaymentOpen(false);
      setPayAmount('');
      setPayDescription('');
      setPayCurrency('INR');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send payment link');
    } finally {
      setIsSendingPayment(false);
    }
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

            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsPaymentOpen(true)}
                >
                  <IndianRupee className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Send payment link</TooltipContent>
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

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Payment Link</DialogTitle>
          </DialogHeader>
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            Requires Razorpay keys in <strong>Settings → Integrations</strong>
          </div>
          <div className="space-y-4 py-2">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="pay-amount">Amount</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div className="w-28 space-y-1.5">
                <Label>Currency</Label>
                <Select value={payCurrency} onValueChange={setPayCurrency}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-desc">Description</Label>
              <Input
                id="pay-desc"
                placeholder="e.g. Order #1234 payment"
                value={payDescription}
                onChange={(e) => setPayDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentOpen(false)} disabled={isSendingPayment}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSendPayment()}
              disabled={isSendingPayment || !payAmount || !payDescription}
            >
              {isSendingPayment ? 'Sending…' : 'Send Payment Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

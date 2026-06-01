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
import { Send, StickyNote, LayoutList, IndianRupee, Sparkles, Loader2, X, ShoppingBag, Paperclip, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSendMessage, useSuggestedReplies, useTypingBroadcast } from '../../hooks/useMessages';
import { InteractiveMessageBuilder } from '../InteractiveMessageBuilder';
import { useWorkspaceStore } from '@/store/workspace.store';

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
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogId, setCatalogId] = useState('');
  const [productId, setProductId] = useState('');
  const [productBodyText, setProductBodyText] = useState('');
  const [isSendingProduct, setIsSendingProduct] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [quickReplies, setQuickReplies] = useState<Array<{ id: string; shortcut: string; title: string; content: string }>>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const sendMessage = useSendMessage();
  const suggestReplies = useSuggestedReplies(conversationId);
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
    const val = e.target.value;
    setText(val);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      void broadcastTyping(true);
    }
    scheduleStopTyping();

    // Quick replies: show popup when text starts with "/"
    if (val.startsWith('/') && workspaceId) {
      const q = val.slice(1).toLowerCase();
      void fetch(`/api/quick-replies?workspaceId=${workspaceId}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data: { replies?: Array<{ id: string; shortcut: string; title: string; content: string }> }) => {
          setQuickReplies(data.replies ?? []);
          setShowQuickReplies(true);
        })
        .catch(() => {});
    } else {
      setShowQuickReplies(false);
      setQuickReplies([]);
    }
  };

  const handleMediaUpload = async (file: File) => {
    if (!file) return;
    setIsUploadingMedia(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('conversationId', conversationId);
      const res = await fetch('/api/messages/media', { method: 'POST', body: form });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      toast.success('Media sent!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSuggest = async () => {
    try {
      const result = await suggestReplies.mutateAsync();
      setSuggestions(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get suggestions');
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    clearTimeout(stopTimerRef.current);
    stopTyping();
    setSuggestions([]);
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

  const handleSendProduct = async () => {
    if (!catalogId.trim() || !productId.trim()) { toast.error('Catalog ID and Product ID are required'); return; }
    setIsSendingProduct(true);
    try {
      const res = await fetch('/api/messages/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          catalogId: catalogId.trim(),
          productId: productId.trim(),
          bodyText: productBodyText.trim() || undefined,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to send product');
      toast.success('Product sent!');
      setIsCatalogOpen(false);
      setCatalogId('');
      setProductId('');
      setProductBodyText('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send product');
    } finally {
      setIsSendingProduct(false);
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
        {/* Quick replies popup */}
        {showQuickReplies && quickReplies.length > 0 && (
          <div className="mb-2 rounded-lg border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto">
            <p className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide border-b border-border">Quick Replies</p>
            {quickReplies.map((qr) => (
              <button
                key={qr.id}
                className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-start gap-2.5"
                onClick={() => {
                  setText(qr.content);
                  setShowQuickReplies(false);
                  setQuickReplies([]);
                }}
              >
                <span className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-mono font-medium text-brand-700 mt-0.5">{qr.shortcut}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium">{qr.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{qr.content}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-2 items-center">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => { setText(s); setSuggestions([]); }}
                className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs text-brand-700 hover:bg-brand-100 transition-colors"
              >
                {s}
              </button>
            ))}
            <button
              onClick={() => setSuggestions([])}
              className="ml-auto rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss suggestions"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
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
                  className="h-8 w-8 text-brand-500 hover:text-brand-700"
                  onClick={() => void handleSuggest()}
                  disabled={suggestReplies.isPending}
                >
                  {suggestReplies.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Sparkles className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Suggest replies</TooltipContent>
            </Tooltip>

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
                  onClick={() => setIsCatalogOpen(true)}
                >
                  <ShoppingBag className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Send product from catalog</TooltipContent>
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

            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingMedia}
                >
                  {isUploadingMedia
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Paperclip className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Send image / file</TooltipContent>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/mp4,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleMediaUpload(f); }}
            />

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
      <Dialog open={isCatalogOpen} onOpenChange={setIsCatalogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Product from Catalog</DialogTitle>
          </DialogHeader>
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
            Requires a <strong>Meta Commerce Catalog</strong> connected to your WhatsApp Business account.
          </div>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="catalog-id">Catalog ID</Label>
              <Input
                id="catalog-id"
                placeholder="e.g. 1234567890"
                value={catalogId}
                onChange={(e) => setCatalogId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-id">Product Retailer ID</Label>
              <Input
                id="product-id"
                placeholder="e.g. SKU-001 or product-abc"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-body">Message (optional)</Label>
              <Input
                id="product-body"
                placeholder="e.g. Check out this product!"
                value={productBodyText}
                onChange={(e) => setProductBodyText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCatalogOpen(false)} disabled={isSendingProduct}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSendProduct()}
              disabled={isSendingProduct || !catalogId || !productId}
            >
              {isSendingProduct ? 'Sending…' : 'Send Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

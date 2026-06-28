'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
import { Send, StickyNote, LayoutList, IndianRupee, Sparkles, Loader2, X, ShoppingBag, Paperclip, Smile, ChevronUp } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const [isCatalogOpen, setIsCatalogOpen]       = useState(false);
  const [catalogId, setCatalogId]               = useState('');
  const [productId, setProductId]               = useState('');
  const [productBodyText, setProductBodyText]   = useState('');
  const [isSendingProduct, setIsSendingProduct] = useState(false);
  const [catalogProducts, setCatalogProducts]   = useState<Array<{ id: string; retailer_id: string; name: string; price?: string; currency?: string; image_url?: string }>>([]);
  const [catalogLoading, setCatalogLoading]     = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productSearch, setProductSearch]       = useState('');
  const [sendMode, setSendMode]                 = useState<'single' | 'list'>('single');
  const [productBodyList, setProductBodyList]   = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [quickReplies, setQuickReplies] = useState<Array<{ id: string; shortcut: string; title: string; content: string }>>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const sendMessage = useSendMessage();

  // Debounced quick-reply fetch — prevents API call on every keystroke
  const quickReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchQuickRepliesDebounced = useCallback((q: string, wsId: string) => {
    if (quickReplyTimerRef.current) clearTimeout(quickReplyTimerRef.current);
    quickReplyTimerRef.current = setTimeout(() => {
      void fetch(`/api/quick-replies?workspaceId=${wsId}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data: { replies?: Array<{ id: string; shortcut: string; title: string; content: string }> }) => {
          setQuickReplies(data.replies ?? []);
          setShowQuickReplies(true);
        })
        .catch(() => {});
    }, 300);
  }, []);
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

    // Quick replies: show popup when text starts with "/" — debounced to prevent API spam
    if (val.startsWith('/') && workspaceId) {
      const q = val.slice(1).toLowerCase();
      fetchQuickRepliesDebounced(q, workspaceId);
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
    const ok = await sendMessage(conversationId, trimmed, isNote);
    if (ok) setText('');   // keep text in box if send failed so user can retry
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

  const openCatalogDialog = async () => {
    setIsCatalogOpen(true);
    setSelectedProducts([]);
    setProductSearch('');
    setSendMode('single');
    setCatalogLoading(true);
    try {
      if (!workspaceId) return;
      const res = await fetch(`/api/catalog?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json() as { catalog_id: string | null; products: typeof catalogProducts };
        if (data.catalog_id) setCatalogId(data.catalog_id);
        setCatalogProducts(data.products ?? []);
      }
    } catch { /* silent */ }
    finally { setCatalogLoading(false); }
  };

  const handleSendProduct = async () => {
    const isListMode = sendMode === 'list';
    if (isListMode) {
      if (!selectedProducts.length) { toast.error('Select at least one product'); return; }
      if (!catalogId) { toast.error('No catalog connected. Configure in Settings → Product Catalog.'); return; }
    } else {
      if (catalogProducts.length > 0 && !selectedProducts[0] && !productId.trim()) {
        toast.error('Select or enter a product'); return;
      }
      if (!catalogId.trim()) { toast.error('Catalog ID required'); return; }
    }
    setIsSendingProduct(true);
    try {
      const singleId = selectedProducts[0] ?? productId.trim();
      const res = await fetch('/api/messages/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isListMode
          ? { conversationId, catalogId, productIds: selectedProducts, bodyText: productBodyList.trim() || undefined }
          : { conversationId, catalogId: catalogId.trim(), productId: singleId, bodyText: productBodyText.trim() || undefined }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to send product');
      toast.success(isListMode ? `${selectedProducts.length} products sent!` : 'Product sent!');
      setIsCatalogOpen(false);
      setCatalogId(''); setProductId(''); setProductBodyText('');
      setSelectedProducts([]); setProductBodyList('');
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
            ref={textareaRef}
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
          <div className="flex items-center gap-1 shrink-0 pb-0.5">
            {/* Emoji picker */}
            <div className="relative">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-8 w-8', showEmojiPicker && 'text-brand-500')}
                    onClick={() => setShowEmojiPicker(v => !v)}
                    type="button"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Emoji</TooltipContent>
              </Tooltip>
              {showEmojiPicker && (
                <div className="absolute bottom-10 right-0 z-50 w-64 rounded-xl border border-border bg-card shadow-xl p-2">
                  <div className="grid grid-cols-8 gap-0.5 max-h-44 overflow-y-auto">
                    {['😀','😂','🥰','😍','🤩','😎','🥳','😊','👍','👎','👏','🙏','❤️','💪','🔥','✅','⭐','💡','📞','💬','📢','🎉','🎁','💰','🛒','📦','⚡','🚀','😅','😭','🤔','😬','🙄','😤','😡','🥺','😢','😱','🤗','🫡','💯','🆕','📝','✉️','📅','⏰','💎','🏆','👋','🤝'].map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => {
                          const ta = textareaRef.current;
                          if (ta) {
                            const start = ta.selectionStart;
                            const end = ta.selectionEnd;
                            const newText = text.slice(0, start) + emoji + text.slice(end);
                            setText(newText);
                            setTimeout(() => {
                              ta.focus();
                              ta.setSelectionRange(start + emoji.length, start + emoji.length);
                            }, 0);
                          } else {
                            setText(t => t + emoji);
                          }
                          setShowEmojiPicker(false);
                        }}
                        className="text-lg p-1 rounded hover:bg-accent transition-colors leading-none"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Suggest */}
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

            {/* Attach file */}
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

            {/* More actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-52">
                <DropdownMenuItem className="gap-2 text-xs" onClick={() => setIsNote((n) => !n)}>
                  <StickyNote className={cn('h-3.5 w-3.5', isNote ? 'text-amber-500' : '')} />
                  {isNote ? 'Exit internal note' : 'Internal note'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-xs" onClick={() => setIsInteractiveOpen(true)}>
                  <LayoutList className="h-3.5 w-3.5" /> Interactive message
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-xs" onClick={() => void openCatalogDialog()}>
                  <ShoppingBag className="h-3.5 w-3.5" /> Send product
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-xs" onClick={() => setIsPaymentOpen(true)}>
                  <IndianRupee className="h-3.5 w-3.5" /> Payment link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Send */}
            <Button
              size="icon"
              className="h-8 w-8 bg-brand-500 hover:bg-brand-600 shrink-0"
              onClick={() => void handleSend()}
              disabled={!text.trim() || isSending}
            >
              {isSending ? <Loader2 className="h-4 w-4 text-white animate-spin" /> : <Send className="h-4 w-4 text-white" />}
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
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-5 w-5 text-brand-500" />
              Send Product
            </DialogTitle>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="px-5 pt-3 flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setSendMode('single'); setSelectedProducts([]); }}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${sendMode === 'single' ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              Single Product
            </button>
            <button
              onClick={() => { setSendMode('list'); setSelectedProducts([]); }}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${sendMode === 'list' ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              Product List (multi)
            </button>
            {sendMode === 'list' && selectedProducts.length > 0 && (
              <span className="text-xs text-muted-foreground">{selectedProducts.length} selected</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            {catalogLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading products…</div>
            ) : catalogProducts.length > 0 ? (
              <>
                {/* Search */}
                <Input
                  placeholder="Search products…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                {/* Products grid */}
                <div className="grid grid-cols-3 gap-2">
                  {catalogProducts
                    .filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.retailer_id.toLowerCase().includes(productSearch.toLowerCase()))
                    .map((p) => {
                      const isSelected = sendMode === 'single'
                        ? selectedProducts[0] === p.retailer_id
                        : selectedProducts.includes(p.retailer_id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (sendMode === 'single') {
                              setSelectedProducts([p.retailer_id]);
                            } else {
                              setSelectedProducts(prev =>
                                prev.includes(p.retailer_id)
                                  ? prev.filter(id => id !== p.retailer_id)
                                  : [...prev, p.retailer_id],
                              );
                            }
                          }}
                          className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${isSelected ? 'border-brand-500 shadow-md' : 'border-border hover:border-brand-300'}`}
                        >
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image_url} alt={p.name} className="w-full h-20 object-cover bg-muted" loading="lazy" />
                          ) : (
                            <div className="w-full h-20 bg-muted flex items-center justify-center">
                              <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="p-2">
                            <p className="text-xs font-semibold truncate leading-tight">{p.name}</p>
                            {p.price && <p className="text-xs text-brand-600 font-bold mt-0.5">{p.currency ?? ''} {p.price}</p>}
                          </div>
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-brand-500 flex items-center justify-center">
                              <span className="text-white text-[10px] font-bold">✓</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
              </>
            ) : (
              /* Fallback: manual entry */
              <div className="space-y-3">
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  No products synced. Go to <strong>Settings → Product Catalog</strong> to connect your Meta catalog first, or enter IDs manually below.
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Catalog ID</Label>
                  <Input placeholder="e.g. 1234567890" value={catalogId} onChange={(e) => setCatalogId(e.target.value)} className="h-8 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Product Retailer ID</Label>
                  <Input placeholder="e.g. SKU-001" value={productId} onChange={(e) => setProductId(e.target.value)} className="h-8 text-sm font-mono" />
                </div>
              </div>
            )}

            {/* Body text */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Message (optional)</Label>
              <Input
                placeholder="e.g. Check out this product!"
                value={sendMode === 'list' ? productBodyList : productBodyText}
                onChange={(e) => sendMode === 'list' ? setProductBodyList(e.target.value) : setProductBodyText(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0">
            <p className="text-xs text-muted-foreground">
              {sendMode === 'list'
                ? selectedProducts.length > 0 ? `${selectedProducts.length} products selected` : 'Tap to select multiple products'
                : selectedProducts[0] ? `Selected: ${catalogProducts.find(p => p.retailer_id === selectedProducts[0])?.name ?? selectedProducts[0]}` : 'Tap a product to select'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsCatalogOpen(false)} disabled={isSendingProduct}>Cancel</Button>
              <Button
                size="sm"
                className="bg-brand-500 hover:bg-brand-600 gap-1.5"
                onClick={() => void handleSendProduct()}
                disabled={isSendingProduct || (catalogProducts.length > 0 ? selectedProducts.length === 0 : (!catalogId || !productId))}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                {isSendingProduct ? 'Sending…' : sendMode === 'list' ? `Send ${selectedProducts.length || ''} Products` : 'Send Product'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

'use client';

// Right pane of Client Inboxes: the message thread for the selected conversation
// plus the reply composer. Fetches its own messages (keyed on conversation id),
// POSTs replies to /api/admin/conversations/[id]/send, and — crucially — shows an
// unmissable "replying as {client}" safety banner because every reply sent here
// goes out on the CLIENT's real WhatsApp/Instagram number to a real customer.
import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Send, AlertTriangle, MessageCircle, Camera } from 'lucide-react';
import { AdminMessageBubble } from './AdminMessageBubble';
import {
  type AdminConversation, type AdminMessage, contactOf, contactLabel,
} from './types';

interface Props {
  conversation: AdminConversation | null;
  workspaceName: string;
}

export function ThreadView({ conversation, workspaceName }: Props) {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationId = conversation?.id ?? null;
  const contact = contactOf(conversation);
  const channel = conversation?.channel ?? 'whatsapp';
  const channelLabel = channel === 'instagram' ? 'Instagram' : 'WhatsApp';

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Load thread whenever the selected conversation changes.
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDraft('');
    fetch(`/api/admin/conversations/${conversationId}/messages?limit=200&offset=0`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? 'Failed to load messages');
        return data;
      })
      .then((data: { messages: AdminMessage[] }) => {
        if (cancelled) return;
        setMessages(data.messages ?? []);
        scrollToBottom();
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load messages');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, scrollToBottom]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !conversationId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/conversations/${conversationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        // Surface the server error verbatim (e.g. the Graph 24h-window message).
        throw new Error(data?.error ?? `Send failed (${res.status})`);
      }
      // Optimistically append the sent message so the admin sees it immediately.
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId ?? `local-${now}`,
          direction: 'outbound',
          content,
          type: 'text',
          created_at: now,
          sender_type: 'agent',
          status: 'sent',
          metadata: { platform_admin_send: true },
        },
      ]);
      setDraft('');
      scrollToBottom();
      toast.success('Reply sent on the client’s number');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  // ── Empty state (no conversation selected) ──────────────────────────────────
  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
          <MessageCircle className="h-6 w-6 text-gray-300" />
        </div>
        <p className="text-sm font-medium text-gray-500">Select a conversation</p>
        <p className="mt-1 text-xs text-gray-400">Pick a conversation on the left to view the thread and reply.</p>
      </div>
    );
  }

  const contactName = contactLabel(contact);
  const contactPhone = contact?.phone ?? '';

  return (
    <div className="flex h-full flex-col">
      {/* Thread header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-xs font-bold text-orange-500">
          {contactName[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{contactName}</p>
          <p className="flex items-center gap-1 truncate text-xs text-gray-400">
            {channel === 'instagram'
              ? <Camera className="h-3 w-3 text-pink-500" />
              : <MessageCircle className="h-3 w-3 text-emerald-500" />}
            {contactPhone || channelLabel}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#F4F6F8] px-4 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <AlertTriangle className="mb-2 h-6 w-6 text-red-400" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">No messages in this conversation yet.</p>
          </div>
        ) : (
          messages.map((m) => <AdminMessageBubble key={m.id} message={m} />)
        )}
      </div>

      {/* Safety banner + reply box */}
      <div className="shrink-0 border-t border-gray-100">
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs leading-snug text-amber-800">
            <span className="font-bold">Replying as {workspaceName}</span>
            {' — this message sends from their '}{channelLabel}
            {' number '}
            <span className="font-semibold">directly to {contactName}</span>
            {contactPhone ? ` (${contactPhone})` : ''}, a real customer.
          </p>
        </div>
        <div className="flex items-end gap-2 p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder={`Reply as ${workspaceName}…`}
            disabled={sending}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-orange-300 focus:bg-white disabled:opacity-60"
          />
          <button
            onClick={() => void handleSend()}
            disabled={sending || !draft.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F97316] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            title="Send reply"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

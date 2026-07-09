'use client';

import { useState, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Camera, MessageSquare, Download, X } from 'lucide-react';
import { EmptyIllustration } from '@/components/ui/empty-illustration';
import { cn } from '@/lib/utils';
import { ConversationItem } from '../ConversationItem';
import { useConversations } from '../../hooks/useConversations';
import { useConversationStore } from '@/store/conversation.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { ConversationWithContact } from '../../services/conversation.service';

const STATUS_TABS = ['all', 'mine', 'open', 'assigned', 'pending', 'resolved'] as const;

const CHANNEL_TABS = [
  { key: 'all',       label: 'All',       icon: null },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: MessageSquare },
  { key: 'instagram', label: 'Instagram', icon: Camera },
] as const;

// ── Export dialog ─────────────────────────────────────────────────────────────
function ExportDialog({
  onClose,
  workspaceId,
}: {
  onClose: () => void;
  workspaceId: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from,        setFrom]        = useState(today);
  const [to,          setTo]          = useState(today);
  const [expStatus,   setExpStatus]   = useState('');
  const [expChannel,  setExpChannel]  = useState('');
  const [downloading, setDownloading] = useState(false);

  function handleDownload() {
    const p = new URLSearchParams({ workspaceId });
    if (from)       p.set('from', from);
    if (to)         p.set('to', to);
    if (expStatus)  p.set('status', expStatus);
    if (expChannel) p.set('channel', expChannel);
    setDownloading(true);
    window.open(`/api/conversations/export?${p}`, '_blank');
    setTimeout(() => setDownloading(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Export Conversations</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">From date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">To date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={expStatus}
              onChange={(e) => setExpStatus(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Channel</label>
            <select
              value={expChannel}
              onChange={(e) => setExpChannel(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All channels</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? 'Downloading…' : 'Download Excel'}
        </button>
      </div>
    </div>
  );
}

export function ConversationList() {
  const [status, setStatus]     = useState<string>('all');
  const [channel, setChannel]   = useState<string>('all');
  const [search, setSearch]     = useState('');
  const [showExport, setShowExport] = useState(false);
  const activeId  = useConversationStore((s) => s.activeConversationId);
  const setActive = useConversationStore((s) => s.setActiveConversation);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? '');

  const { data: conversations = [], isLoading } = useConversations(status, channel);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const contact = c.contacts;
      const name = (contact?.name ?? '').toLowerCase();
      const phone = (contact?.phone ?? '').toLowerCase();
      const msg = (c.last_message ?? '').toLowerCase();
      return name.includes(q) || phone.includes(q) || msg.includes(q);
    });
  }, [search, conversations]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 5,
  });

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
      {showExport && (
        <ExportDialog workspaceId={workspaceId} onClose={() => setShowExport(false)} />
      )}

      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Conversations</h2>
          <button
            onClick={() => setShowExport(true)}
            title="Export conversations to Excel"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Channel filter */}
      <div className="shrink-0 border-b border-border px-3 py-1.5 flex items-center gap-1">
        {CHANNEL_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setChannel(key)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              channel === key
                ? 'bg-brand-500/10 text-brand-600'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {label}
          </button>
        ))}
      </div>

      {/* Status tabs */}
      <div className="shrink-0 border-b border-border px-2 py-1">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="h-7 w-full gap-0 bg-transparent p-0">
            {STATUS_TABS.map((s) => (
              <TabsTrigger
                key={s}
                value={s}
                className="h-7 flex-1 rounded-md px-1 text-[11px] capitalize data-[state=active]:bg-accent data-[state=active]:shadow-none"
              >
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex-1 space-y-1 p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <EmptyIllustration
            type={search.trim() ? 'search' : 'chat'}
            title="No conversations found"
            description={search.trim() ? 'Try a different search term.' : 'Conversations will appear here once customers message you.'}
          />
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((row) => {
              const conv = filtered[row.index] as ConversationWithContact;
              return (
                <div
                  key={row.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${row.start}px)`,
                  }}
                >
                  <ConversationItem
                    conversation={conv}
                    isActive={conv.id === activeId}
                    onClick={() => setActive(conv.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

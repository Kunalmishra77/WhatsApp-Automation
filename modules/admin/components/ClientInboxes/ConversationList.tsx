'use client';

// Left pane of Client Inboxes: search + status filter + the scrollable
// conversation list with "Load more" pagination. Purely presentational —
// all fetching/pagination state lives in the orchestrator (index.tsx).
import { format, isToday, isYesterday } from 'date-fns';
import { Search, Loader2, MessageCircle, Camera, Inbox } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { type AdminConversation, contactOf, contactLabel } from './types';

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  snoozed: 'bg-violet-100 text-violet-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-500',
};

function ChannelIcon({ channel }: { channel: string | null }) {
  if (channel === 'instagram') return <Camera className="h-3.5 w-3.5 text-pink-500" />;
  return <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />;
}

function relTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

interface Props {
  conversations: AdminConversation[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  selectedId: string | null;
  search: string;
  status: string;
  onSearchChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onSelect: (conv: AdminConversation) => void;
  onLoadMore: () => void;
}

export function ConversationList({
  conversations, total, loading, loadingMore, selectedId,
  search, status, onSearchChange, onStatusChange, onSelect, onLoadMore,
}: Props) {
  const hasMore = conversations.length < total;

  return (
    <div className="flex h-full flex-col">
      {/* Filters */}
      <div className="shrink-0 space-y-2 border-b border-gray-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name or phone…"
            className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-orange-300 focus:bg-white"
          />
        </div>
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="snoozed">Snoozed</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Inbox className="mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-400">No conversations</p>
          </div>
        ) : (
          <>
            {conversations.map((conv) => {
              const contact = contactOf(conv);
              const active = conv.id === selectedId;
              const unread = (conv.unread_count ?? 0) > 0;
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv)}
                  className={`flex w-full items-start gap-3 border-b border-gray-50 px-3 py-3 text-left transition-colors ${
                    active ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-xs font-bold text-orange-500">
                    {contactLabel(contact)[0]?.toUpperCase() ?? '?'}
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5">
                      <ChannelIcon channel={conv.channel} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                        {contactLabel(contact)}
                      </span>
                      <span className="shrink-0 text-[10px] text-gray-400">{relTime(conv.last_message_at)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`truncate text-xs ${unread ? 'text-gray-700' : 'text-gray-400'}`}>
                        {conv.last_message || 'No messages yet'}
                      </span>
                      {unread && (
                        <span className="shrink-0 rounded-full bg-[#F97316] px-1.5 py-0.5 text-[9px] font-bold text-white tabular-nums">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    {conv.status && (
                      <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize ${STATUS_STYLE[conv.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {conv.status}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {hasMore && (
              <div className="p-3">
                <button
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                  {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Load more ({conversations.length} of {total})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

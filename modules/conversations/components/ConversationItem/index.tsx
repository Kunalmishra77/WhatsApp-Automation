'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import type { ConversationWithContact } from '../../services/conversation.service';

interface ConversationItemProps {
  conversation: ConversationWithContact;
  isActive: boolean;
  onClick: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  open:     'bg-emerald-500',
  assigned: 'bg-brand-500',
  pending:  'bg-amber-500',
  snoozed:  'bg-gray-400',
  resolved: 'bg-gray-300',
};

export function ConversationItem({ conversation, isActive, onClick }: ConversationItemProps) {
  const contact = conversation.contacts;
  const name = contact?.name ?? contact?.phone ?? 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNowStrict(new Date(conversation.last_message_at), { addSuffix: false })
    : '';

  const hasUnread = conversation.unread_count > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-all duration-150',
        'hover:bg-accent/60 active:scale-[0.99]',
        isActive
          ? 'bg-brand-500/10 border-r-2 border-brand-500'
          : 'border-r-2 border-transparent',
      )}
    >
      <div className="relative mt-0.5 shrink-0">
        <Avatar className={cn('h-10 w-10 transition-transform', isActive && 'ring-2 ring-brand-500/40 ring-offset-1')}>
          <AvatarImage src={contact?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
            STATUS_COLORS[conversation.status] ?? 'bg-gray-300',
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className={cn('truncate text-sm text-foreground', hasUnread ? 'font-bold' : 'font-semibold')}>
              {name}
            </p>
            {(conversation as any).contacts?.is_vip && (
              <span className="text-[10px] text-amber-500 shrink-0" title="VIP">⭐</span>
            )}
            {conversation.channel === 'instagram' && (
              <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white leading-none">IG</span>
            )}
            {conversation.channel === 'messenger' && (
              <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-blue-500 text-white leading-none">FB</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasUnread && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white leading-none">
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </span>
            )}
            <span className={cn('text-[11px]', hasUnread ? 'text-brand-500 font-semibold' : 'text-muted-foreground')}>
              {timeAgo}
            </span>
          </div>
        </div>

        <p className={cn('truncate text-xs mt-0.5', hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground')}>
          {conversation.last_message ?? 'No messages yet'}
        </p>

        {/* Metadata row */}
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          {(conversation as any).sentiment === 'positive' && (
            <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" title="Positive" />
          )}
          {(conversation as any).sentiment === 'negative' && (
            <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" title="Negative" />
          )}
          {(conversation as any).sla_first_breach && (
            <span className="text-[10px] font-semibold text-red-500 shrink-0">⚠ SLA</span>
          )}
          {conversation.labels.slice(0, 2).map((label) => (
            <span key={label} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60 leading-none">
              {label}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

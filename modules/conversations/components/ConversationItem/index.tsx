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

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent',
        isActive && 'bg-brand-500/10 border-r-2 border-brand-500',
      )}
    >
      <div className="relative mt-0.5 shrink-0">
        <Avatar className="h-10 w-10">
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
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground mt-0.5">
          {conversation.last_message ?? 'No messages yet'}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          {conversation.unread_count > 0 && (
            <Badge className="h-4 min-w-4 rounded-full bg-brand-500 px-1 text-[10px] text-white">
              {conversation.unread_count}
            </Badge>
          )}
          {conversation.labels.slice(0, 2).map((label) => (
            <Badge key={label} variant="outline" className="h-4 px-1.5 text-[10px]">
              {label}
            </Badge>
          ))}
        </div>
      </div>
    </button>
  );
}

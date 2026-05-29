'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckCircle2, MoreVertical, PhoneCall, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateConversationStatus } from '../../services/conversation.service';
import { useQueryClient } from '@tanstack/react-query';
import type { ConversationWithContact } from '../../services/conversation.service';

interface ConversationHeaderProps {
  conversation: ConversationWithContact;
}

const STATUS_BADGE: Record<string, string> = {
  open:     'bg-emerald-100 text-emerald-700',
  assigned: 'bg-brand-100 text-brand-700',
  pending:  'bg-amber-100 text-amber-700',
  resolved: 'bg-gray-100 text-gray-600',
  snoozed:  'bg-gray-100 text-gray-500',
};

export function ConversationHeader({ conversation }: ConversationHeaderProps) {
  const queryClient = useQueryClient();
  const contact = conversation.contacts;
  const name = contact?.name ?? contact?.phone ?? 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();

  const resolve = async () => {
    await updateConversationStatus(conversation.id, 'resolved');
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    void queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
  };

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={contact?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">{name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{contact?.phone}</p>
        </div>
        <span
          className={cn(
            'ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
            STATUS_BADGE[conversation.status] ?? 'bg-gray-100 text-gray-500',
          )}
        >
          {conversation.status}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {conversation.status !== 'resolved' && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void resolve()}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Resolve
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2">
              <User className="h-4 w-4" /> View Contact
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <PhoneCall className="h-4 w-4" /> Call
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

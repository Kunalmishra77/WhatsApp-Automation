'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { CheckCircle2, Clock, MoreVertical, PhoneCall, User, UserCheck, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/services/supabase/client';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAssignAgent, useChangeStatus, useResolveConversation } from '../../hooks/useConversationActions';
import type { ConversationWithContact } from '../../services/conversation.service';

interface ConversationHeaderProps {
  conversation: ConversationWithContact;
}

interface WorkspaceMember {
  user_id: string;
  role: string;
  profiles: {
    full_name: string;
    email: string;
    avatar_url: string | null;
  } | null;
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
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  const assignAgent = useAssignAgent();
  const changeStatus = useChangeStatus();
  const resolveConversation = useResolveConversation();

  const contact = conversation.contacts;
  const name = contact?.name ?? contact?.phone ?? 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();

  // Fetch workspace members for assign dropdown
  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();
    const fetchMembers = async () => {
      const { data, error } = await (supabase as any)
        .from('workspace_members')
        .select('user_id, role, profiles(full_name, email, avatar_url)')
        .eq('workspace_id', workspaceId);
      if (!error && data) {
        setMembers(data as WorkspaceMember[]);
      }
    };
    void fetchMembers();
  }, [workspaceId]);

  // Find assigned agent name
  const assignedMember = members.find((m) => m.user_id === conversation.assigned_agent_id);
  const assignedName = assignedMember?.profiles?.full_name
    ?? assignedMember?.profiles?.email
    ?? null;

  const handleAssign = (agentId: string | null) => {
    assignAgent.mutate(
      { conversationId: conversation.id, agentId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['conversations'] });
          void queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
        },
      },
    );
  };

  const handleStatus = (status: 'open' | 'resolved' | 'pending' | 'snoozed') => {
    changeStatus.mutate(
      { conversationId: conversation.id, status },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['conversations'] });
          void queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
        },
      },
    );
  };

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: contact info + status badge */}
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

      {/* Right: action controls */}
      <div className="flex items-center gap-1.5">
        {/* Assign Agent Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs max-w-[140px]"
              disabled={assignAgent.isPending}
            >
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {assignedName ?? 'Assign Agent'}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Assign to agent
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {members.length === 0 && (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                No agents found
              </DropdownMenuItem>
            )}
            {members.map((member) => {
              const memberName = member.profiles?.full_name ?? member.profiles?.email ?? member.user_id;
              const isAssigned = member.user_id === conversation.assigned_agent_id;
              return (
                <DropdownMenuItem
                  key={member.user_id}
                  className={cn('gap-2 text-xs', isAssigned && 'font-medium')}
                  onClick={() => handleAssign(member.user_id)}
                >
                  <User className="h-3.5 w-3.5" />
                  <span className="truncate">{memberName}</span>
                  {isAssigned && (
                    <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  )}
                </DropdownMenuItem>
              );
            })}
            {conversation.assigned_agent_id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-xs text-muted-foreground"
                  onClick={() => handleAssign(null)}
                >
                  Unassign
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Pending button — only show if not already pending/resolved */}
        {conversation.status !== 'pending' && conversation.status !== 'resolved' && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
            onClick={() => handleStatus('pending')}
            disabled={changeStatus.isPending}
          >
            <Clock className="h-3.5 w-3.5" />
            Pending
          </Button>
        )}

        {/* Resolve button — only show if not resolved */}
        {conversation.status !== 'resolved' && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              resolveConversation.mutate(conversation.id, {
                onSuccess: () => {
                  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
                  void queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
                },
              });
            }}
            disabled={resolveConversation.isPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Resolve
          </Button>
        )}

        {/* Reopen button — only when resolved */}
        {conversation.status === 'resolved' && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => handleStatus('open')}
            disabled={changeStatus.isPending}
          >
            Reopen
          </Button>
        )}

        {/* More options menu */}
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

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
import { CheckCircle2, Clock, MoreVertical, PhoneCall, User, UserCheck, ChevronDown, Bot, BotOff, Sparkles, Wand2, GitMerge, RefreshCw, FileText, Tag, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAssignAgent, useChangeStatus, useResolveConversation, useBotPause, useSummarize } from '../../hooks/useConversationActions';
import type { ConversationWithContact } from '../../services/conversation.service';
import { LabelBadge, LabelPicker } from '../LabelPicker';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';

interface ConversationHeaderProps {
  conversation: ConversationWithContact;
  panelToggle?: React.ReactNode;
}

interface WorkspaceMember {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  open:     'bg-emerald-100 text-emerald-700',
  assigned: 'bg-brand-100 text-brand-700',
  pending:  'bg-amber-100 text-amber-700',
  resolved: 'bg-gray-100 text-gray-600',
  snoozed:  'bg-gray-100 text-gray-500',
};

export function ConversationHeader({ conversation, panelToggle }: ConversationHeaderProps) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const assignAgent       = useAssignAgent();
  const changeStatus      = useChangeStatus();
  const resolveConversation = useResolveConversation();
  const botPause          = useBotPause();
  const summarize         = useSummarize();

  const isBotPaused = !!(conversation as any).bot_paused;
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const currentLabels = Array.isArray((conversation as any).labels) ? (conversation as any).labels as string[] : [];

  const { data: formsData } = useQuery({
    queryKey: ['wa-forms', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { forms: [] };
      const r = await fetch(`/api/wa-forms?workspaceId=${workspaceId}`);
      return r.ok ? r.json() as Promise<{ forms: Array<{ id: string; name: string; is_active: boolean }> }> : { forms: [] };
    },
    enabled: !!workspaceId,
  });
  const activeForms = (formsData?.forms ?? []).filter(f => f.is_active);

  const handleSendForm = async (formId: string) => {
    setShowFormPicker(false);
    try {
      const r = await fetch(`/api/wa-forms/${formId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id }),
      });
      const d = await r.json() as { error?: string };
      if (!r.ok) { toast.error(d.error ?? 'Failed to send form'); return; }
      toast.success('Form started! First question sent.');
    } catch { toast.error('Network error'); }
  };

  const contact = conversation.contacts;
  const name = contact?.name ?? contact?.phone ?? 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();

  // Fetch workspace members via server API (admin client bypasses profiles RLS)
  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/team/members?workspaceId=${workspaceId}`)
      .then((r) => r.ok ? r.json() as Promise<{ members: WorkspaceMember[] }> : null)
      .then((d) => { if (d?.members) setMembers(d.members); })
      .catch(() => {});
  }, [workspaceId]);

  // Find assigned agent name
  const assignedMember = members.find((m) => m.user_id === conversation.assigned_agent_id);
  const assignedName = assignedMember?.full_name ?? assignedMember?.email ?? null;

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

  const handleSmartAssign = () => {
    if (!workspaceId) return;
    fetch(`/api/conversations/${conversation.id}/smart-assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    })
      .then((r) => r.json() as Promise<{ assignedName?: string; error?: string }>)
      .then((data) => {
        if (data.error) { toast.error(data.error); return; }
        toast.success(`Auto-assigned to ${data.assignedName ?? 'agent'}`);
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        void queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      })
      .catch(() => toast.error('Smart assign failed'));
  };

  const handleBotPauseToggle = () => {
    botPause.mutate(
      { conversationId: conversation.id, paused: !isBotPaused },
      {
        onSuccess: (data) => {
          toast.success(data.bot_paused ? 'Bot paused — you have control' : 'Bot resumed');
        },
      },
    );
  };

  const handleExportConversation = () => {
    if (!workspaceId) return;
    const url = `/api/conversations/${conversation.id}/export?workspaceId=${workspaceId}`;
    const a = document.createElement('a');
    a.href = url;
    a.click();
  };

  const handleSummarize = () => {
    summarize.mutate(conversation.id, {
      onSuccess: (data) => {
        setSummary(data.summary);
        setSummaryOpen(true);
      },
      onError: () => toast.error('Failed to generate summary'),
    });
  };

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 overflow-hidden">
      {/* Left: contact info + status badge */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={contact?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-none truncate">{name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
            <p className="text-xs text-muted-foreground shrink-0">{contact?.phone}</p>
            {currentLabels.slice(0, 2).map((lbl) => (
              <LabelBadge key={lbl} label={lbl} />
            ))}
            {currentLabels.length > 2 && (
              <span className="text-[10px] text-muted-foreground shrink-0">+{currentLabels.length - 2}</span>
            )}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
            STATUS_BADGE[conversation.status] ?? 'bg-gray-100 text-gray-500',
          )}
        >
          {conversation.status}
        </span>
      </div>

      {/* Right: action controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Bot Pause Toggle */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-7 gap-1.5 text-xs',
            isBotPaused
              ? 'border-red-200 text-red-600 hover:bg-red-50'
              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
          )}
          onClick={handleBotPauseToggle}
          disabled={botPause.isPending}
          title={isBotPaused ? 'Bot paused — click to resume' : 'Bot active — click to pause'}
        >
          {isBotPaused ? <BotOff className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{isBotPaused ? 'Paused' : 'Bot'}</span>
        </Button>

        {/* Assign Agent Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs max-w-[130px]"
              disabled={assignAgent.isPending}
            >
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate hidden sm:inline">
                {assignedName ?? 'Assign'}
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
              const memberName = member.full_name ?? member.email ?? member.user_id;
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
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-xs" onClick={handleSmartAssign}>
              <Wand2 className="h-3.5 w-3.5" /> Smart Auto-Assign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Resolve / Reopen */}
        {conversation.status !== 'resolved' ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
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
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Resolve</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => handleStatus('open')}
            disabled={changeStatus.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reopen</span>
          </Button>
        )}

        {/* More options — Summary, Labels, Pending, Merge, etc. */}
        <Popover open={labelPickerOpen} onOpenChange={setLabelPickerOpen}>
          <PopoverTrigger className="hidden" />
          <PopoverContent className="w-52 p-2" align="end" side="bottom">
            <LabelPicker conversationId={conversation.id} currentLabels={currentLabels} />
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {/* Labels */}
            <DropdownMenuItem
              className="gap-2 text-xs"
              onSelect={(e) => { e.preventDefault(); setLabelPickerOpen(true); }}
            >
              <Tag className="h-3.5 w-3.5 text-brand-500" /> Manage Labels
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* AI Summary */}
            <DropdownMenuItem
              className="gap-2 text-xs"
              disabled={summarize.isPending}
              onSelect={(e) => { e.preventDefault(); handleSummarize(); }}
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              {summarize.isPending ? 'Summarizing…' : 'AI Summary'}
            </DropdownMenuItem>

            {/* Pending */}
            {conversation.status !== 'pending' && conversation.status !== 'resolved' && (
              <DropdownMenuItem
                className="gap-2 text-xs"
                onClick={() => handleStatus('pending')}
                disabled={changeStatus.isPending}
              >
                <Clock className="h-3.5 w-3.5 text-amber-500" /> Mark as Pending
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="gap-2 text-xs"
              onClick={() => {
                const other = prompt('Enter conversation ID to merge into this one:');
                if (other) {
                  fetch('/api/conversations/merge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspaceId, primaryId: conversation.id, secondaryId: other }),
                  })
                    .then((r) => r.json() as Promise<{ error?: string }>)
                    .then((d) => {
                      if (d.error) toast.error(d.error);
                      else { toast.success('Conversations merged'); void queryClient.invalidateQueries({ queryKey: ['conversations'] }); }
                    })
                    .catch(() => toast.error('Merge failed'));
                }
              }}
            >
              <GitMerge className="h-3.5 w-3.5" /> Merge Conversation
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-xs">
              <User className="h-3.5 w-3.5" /> View Contact
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-xs">
              <PhoneCall className="h-3.5 w-3.5" /> Call
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-xs" onClick={handleExportConversation}>
              <Download className="h-3.5 w-3.5 text-brand-500" /> Download Conversation (CSV)
            </DropdownMenuItem>
            {activeForms.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] text-muted-foreground px-2 py-1">Send Form</DropdownMenuLabel>
                {activeForms.map(f => (
                  <DropdownMenuItem key={f.id} className="gap-2 text-xs" onClick={() => void handleSendForm(f.id)}>
                    <FileText className="h-3.5 w-3.5 text-brand-500" /> {f.name}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* AI Summary Popover — triggered from dropdown but rendered here */}
        {summary && (
          <Popover open={summaryOpen} onOpenChange={setSummaryOpen}>
            <PopoverTrigger className="hidden" />
            <PopoverContent className="w-80 text-sm" align="end">
              <p className="font-semibold text-xs text-muted-foreground mb-2 uppercase tracking-wide">AI Summary</p>
              <p className="text-xs text-foreground leading-relaxed">{summary}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3 h-7 w-full text-xs text-muted-foreground"
                onClick={handleSummarize}
              >
                Regenerate
              </Button>
            </PopoverContent>
          </Popover>
        )}

        {panelToggle}
      </div>
    </div>
  );
}

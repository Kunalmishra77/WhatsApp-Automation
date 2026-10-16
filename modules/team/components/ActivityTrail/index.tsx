'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { History, ChevronLeft, ChevronRight, Monitor } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useActivity, useTeam } from '../../hooks/useTeam';
import type { ActivityEntry } from '../../services/team.service';

const ENTITY_TYPES = [
  'workspace_member', 'workspace_role', 'team_invite', 'contact',
  'conversation', 'task', 'campaign', 'template', 'knowledge_base', 'workspace',
];

const ENTITY_LABELS: Record<string, string> = {
  workspace_member: 'Team member',
  workspace_role:   'Role',
  team_invite:      'Invite',
  contact:          'Client',
  conversation:     'Conversation',
  task:             'Task',
  campaign:         'Campaign',
  template:         'Template',
  knowledge_base:   'Knowledge base',
  workspace:        'Workspace',
};

const ALL = '__all__';

/**
 * The workspace activity trail: every recorded action, who did it, and from
 * where. Filterable by person, kind of thing and date, so "what changed on
 * Tuesday" and "what has this employee been doing" are both one click away.
 */
export function ActivityTrail({ actorId: fixedActor }: { actorId?: string }) {
  const { data: members = [] } = useTeam();
  const [actorId, setActorId]       = useState(fixedActor ?? '');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom]             = useState('');
  const [to, setTo]                 = useState('');
  const [page, setPage]             = useState(0);

  const { data, isLoading, isFetching } = useActivity({
    ...(fixedActor ?? actorId ? { actorId: fixedActor ?? actorId } : {}),
    ...(entityType ? { entityType } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
  });

  const entries = data?.entries ?? [];
  const total   = data?.total ?? 0;
  const pages   = Math.max(Math.ceil(total / 50), 1);

  const resetTo = (fn: () => void) => { fn(); setPage(0); };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <History className="h-4 w-4 text-brand-600" /> Activity
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {total.toLocaleString('en-IN')} recorded action{total === 1 ? '' : 's'} in this workspace.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {!fixedActor && (
          <Select value={actorId || ALL} onValueChange={(v) => resetTo(() => setActorId(v === ALL ? '' : v))}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Anyone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">Anyone</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id} className="text-xs">{m.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={entityType || ALL} onValueChange={(v) => resetTo(() => setEntityType(v === ALL ? '' : v))}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Everything" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">Everything</SelectItem>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">{ENTITY_LABELS[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input type="date" value={from} className="h-8 w-36 text-xs"
          onChange={(e) => resetTo(() => setFrom(e.target.value))} />
        <Input type="date" value={to} className="h-8 w-36 text-xs"
          onChange={(e) => resetTo(() => setTo(e.target.value))} />

        {(actorId || entityType || from || to) && !fixedActor && (
          <Button size="sm" variant="ghost" className="h-8 text-xs"
            onClick={() => resetTo(() => { setActorId(''); setEntityType(''); setFrom(''); setTo(''); })}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">Nothing recorded yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Actions your team takes from here on will appear in this trail.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {entries.map((e) => <Row key={e.id} entry={e} />)}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page + 1} of {pages}</p>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2"
              disabled={page === 0 || isFetching} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2"
              disabled={page + 1 >= pages || isFetching} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ entry }: { entry: ActivityEntry }) {
  const who      = entry.actor?.full_name ?? entry.actor?.email ?? 'System';
  const initials = who.slice(0, 2).toUpperCase();
  const when     = new Date(entry.created_at);

  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={entry.actor?.avatar_url ?? undefined} />
        <AvatarFallback className="bg-brand-100 text-brand-700 text-[10px] font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          <span className="font-medium">{who}</span>{' '}
          <span className="text-muted-foreground">{entry.label.toLowerCase()}</span>
          {entry.entity_label && <> <span className="font-medium">{entry.entity_label}</span></>}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
          <span title={format(when, 'PPpp')}>{formatDistanceToNow(when, { addSuffix: true })}</span>
          <span>· {ENTITY_LABELS[entry.entity_type] ?? entry.entity_type}</span>
          {entry.ip_address && (
            <span className="inline-flex items-center gap-1">
              · <Monitor className="h-3 w-3" /> {entry.ip_address}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

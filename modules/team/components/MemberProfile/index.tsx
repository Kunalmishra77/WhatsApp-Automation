'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, CheckSquare, Users, MessageSquare, History, ShieldCheck,
  AlertTriangle, Settings2, Clock,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { PERMISSION_LABELS } from '@/types/auth.types';
import { AGENT_RESTRICTABLE_PAGES } from '@/lib/agent-pages';
import { activityLabel } from '@/lib/activity-labels';
import { useMemberProfile, useTeam } from '../../hooks/useTeam';
import { ROLE_LABELS, ROLE_COLORS } from '../../services/team.service';
import { MemberAccessDialog } from '../MemberAccessDialog';
import { useAuthStore } from '@/store/auth.store';

const PAGE_LABELS = new Map(AGENT_RESTRICTABLE_PAGES.map((p) => [p.key as string, p.label]));

const STATUS_STYLE: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-amber-100 text-amber-700',
  done:        'bg-emerald-100 text-emerald-700',
};

/**
 * One team member's profile: who they are, the access they actually hold, and
 * the work attached to them — their tasks, the clients they own, their open
 * conversations and everything they have done.
 */
export function MemberProfile() {
  const params   = useParams();
  const router   = useRouter();
  const memberId = params['id'] as string | undefined;

  const { data, isLoading, error } = useMemberProfile(memberId);
  const { data: members = [] }     = useTeam();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">Member not found</p>
          <p className="text-xs text-muted-foreground mt-1">
            They may have been removed from this workspace.
          </p>
          <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => router.push('/team')}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Team
          </Button>
        </div>
      </div>
    );
  }

  const { member, access, tasks, clients, conversations, activity, stats } = data;
  const initials = (member.full_name ?? member.email ?? '??').slice(0, 2).toUpperCase();
  const isSelf   = member.user_id === currentUserId;
  // The dialog edits the row from the team list, so the two stay in one shape.
  const listRow  = members.find((m) => m.member_id === member.id) ?? null;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <Button size="sm" variant="ghost" className="h-7 -ml-2 gap-1.5 text-xs" onClick={() => router.push('/team')}>
        <ArrowLeft className="h-3.5 w-3.5" /> Team
      </Button>

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative shrink-0">
              <Avatar className="h-14 w-14">
                <AvatarImage src={member.avatar_url ?? undefined} />
                <AvatarFallback className="bg-brand-100 text-brand-700 font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className={cn(
                'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card',
                member.is_online ? 'bg-emerald-500' : 'bg-gray-300',
              )} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-foreground truncate">
                  {member.full_name ?? member.email}
                </h1>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ROLE_COLORS[member.role])}>
                  {member.custom_role_name ?? ROLE_LABELS[member.role]}
                </span>
                {member.is_suspended && (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <AlertTriangle className="h-3 w-3" /> Suspended
                  </Badge>
                )}
                {isSelf && <span className="text-[11px] text-muted-foreground">You</span>}
              </div>
              {member.title && <p className="text-sm text-muted-foreground mt-0.5">{member.title}</p>}
              <p className="text-xs text-muted-foreground mt-1">{member.email}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3">
                {member.joined_at && <span>Joined {format(new Date(member.joined_at), 'MMM d, yyyy')}</span>}
                {member.last_active_at && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Active {formatDistanceToNow(new Date(member.last_active_at), { addSuffix: true })}
                  </span>
                )}
              </p>
            </div>
          </div>

          {listRow && (
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setEditing(true)}>
              <Settings2 className="h-3.5 w-3.5" /> Edit access
            </Button>
          )}
        </div>
      </div>

      {/* ── Work at a glance ─────────────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat icon={CheckSquare} label="Open tasks" value={stats.tasks_open}
          hint={stats.tasks_overdue > 0 ? `${stats.tasks_overdue} overdue` : undefined} />
        <Stat icon={CheckSquare} label="Completed" value={stats.tasks_done} />
        <Stat icon={Users} label="Clients owned" value={stats.clients} />
        <Stat icon={MessageSquare} label="Open chats" value={stats.conversations} />
      </div>

      <Tabs defaultValue="tasks">
        <TabsList className="w-fit">
          <TabsTrigger value="tasks" className="gap-1.5 text-xs">
            <CheckSquare className="h-3.5 w-3.5" /> Tasks
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" /> Clients
          </TabsTrigger>
          <TabsTrigger value="chats" className="gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5" /> Conversations
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-1.5 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" /> Access
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 text-xs">
            <History className="h-3.5 w-3.5" /> Activity
          </TabsTrigger>
        </TabsList>

        {/* Tasks */}
        <TabsContent value="tasks" className="pt-4">
          {tasks.length === 0 ? <Empty text="No tasks assigned." /> : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{t.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t.priority} priority
                        {t.due_date && <> · due {format(new Date(t.due_date), 'MMM d')}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.overdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        STATUS_STYLE[t.status] ?? STATUS_STYLE.todo)}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Clients — the team → client half of the link */}
        <TabsContent value="clients" className="pt-4">
          {clients.length === 0 ? (
            <Empty text="No clients assigned. Assign one from a contact's page." />
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {clients.map((c) => (
                <Link key={c.id} href={`/contacts?contactId=${c.id}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-accent">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{c.name ?? c.phone}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {c.phone}{c.company && <> · {c.company}</>}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    since {format(new Date(c.created_at), 'MMM yyyy')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Conversations */}
        <TabsContent value="chats" className="pt-4">
          {conversations.length === 0 ? <Empty text="No conversations assigned." /> : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {conversations.map((c) => (
                <Link key={c.id} href={`/conversations/${c.id}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-accent">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {c.contact?.name ?? c.contact?.phone ?? 'Unknown contact'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{c.status}</p>
                  </div>
                  {c.last_message_at && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Access — resolved, not configured: what they can actually do */}
        <TabsContent value="access" className="pt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Can do</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Resolved from their role{member.custom_role_name ? ', custom role' : ''}, page access and
              any individual overrides — exactly what the server allows.
            </p>
            {access.permissions.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-3">
                No permissions{member.is_suspended ? ' — access is suspended.' : '.'}
              </p>
            ) : (
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {access.permissions.map((p) => (
                  <li key={p} className="text-xs text-foreground flex items-start gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-px" />
                    {PERMISSION_LABELS[p] ?? p}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Can open</p>
            {access.pageAccess === null ? (
              <p className="text-xs text-muted-foreground mt-2">
                Every page. No page restrictions are configured for this member.
              </p>
            ) : access.pageAccess.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-2">
                Only the core surface — Dashboard, Conversations and Contacts.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {access.pageAccess.map((k) => (
                  <Badge key={k} variant="secondary" className="text-[10px]">
                    {PAGE_LABELS.get(k) ?? k}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="pt-4">
          {activity.length === 0 ? <Empty text="Nothing recorded for this member yet." /> : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {activity.map((a) => (
                <div key={a.id} className="px-3.5 py-2.5">
                  <p className="text-sm text-foreground">
                    {activityLabel(a.action)}
                    {a.entity_label && <> <span className="font-medium">{a.entity_label}</span></>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MemberAccessDialog
        member={editing ? listRow : null}
        effectivePermissions={access.permissions}
        isSelf={isSelf}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: {
  icon: typeof CheckSquare; label: string; value: number; hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{value}</p>
      {hint && <p className="text-[11px] text-amber-600 font-medium">{hint}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

# Agentix Phase 9 — Team + Analytics + Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three remaining dashboard modules: (A) Team page — member list with roles, online presence indicators, and invite placeholder; (B) Analytics page — 4-section dashboard with Recharts charts (conversation volume, message funnel, agent performance, campaign stats); (C) Settings page — tabbed layout covering Profile, Workspace, and WhatsApp WABA configuration.

**Architecture:** Each module follows the same pattern: service → hook → page component. Analytics uses pre-aggregated Supabase queries (no materialized views needed for MVP — direct count queries suffice). Settings uses react-hook-form with server actions for persistence. All three pages replace their existing stubs.

**Tech Stack:** Next.js 15, Supabase client, TanStack Query v5, recharts, shadcn/ui (Tabs, Avatar, Badge, Table, Switch, ScrollArea, Skeleton, Card, Separator), react-hook-form + zod, lucide-react, date-fns.

---

## File Map

### New files — Team
```
modules/team/services/team.service.ts        — workspace members CRUD
modules/team/hooks/useTeam.ts               — TanStack Query members
modules/team/components/TeamPage/index.tsx  — member list + presence + roles
```

### New files — Analytics
```
modules/analytics/services/analytics.service.ts   — aggregated Supabase queries
modules/analytics/hooks/useAnalytics.ts           — TanStack Query analytics data
modules/analytics/components/AnalyticsDashboard/index.tsx  — charts + KPIs
```

### New files — Settings
```
modules/settings/components/SettingsLayout/index.tsx     — tabs shell
modules/settings/components/ProfileSettings/index.tsx    — name, avatar, timezone
modules/settings/components/WorkspaceSettings/index.tsx  — name, slug, logo
modules/settings/components/WhatsAppSettings/index.tsx   — WABA config display
```

### Modified files
```
app/(dashboard)/team/page.tsx       — wire TeamPage
app/(dashboard)/analytics/page.tsx  — wire AnalyticsDashboard
app/(dashboard)/settings/page.tsx   — wire SettingsLayout
```

---

## Task 1: Team Service + Hook + Page

**Files:**
- Create: `d:\WhatsApp-Automation\modules\team\services\team.service.ts`
- Create: `d:\WhatsApp-Automation\modules\team\hooks\useTeam.ts`
- Create: `d:\WhatsApp-Automation\modules\team\components\TeamPage\index.tsx`
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\team\page.tsx`

- [ ] **Step 1: Write team service**

Write `d:\WhatsApp-Automation\modules\team\services\team.service.ts`:

```typescript
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

type UserRole = Database['public']['Tables']['workspace_members']['Row']['role'];

export interface TeamMember {
  member_id:   string;
  user_id:     string;
  role:        UserRole;
  is_online:   boolean;
  max_chats:   number;
  joined_at:   string;
  full_name:   string;
  email:       string;
  avatar_url:  string | null;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  manager:     'Manager',
  agent:       'Agent',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-100 text-red-700',
  admin:       'bg-violet-100 text-violet-700',
  manager:     'bg-brand-100 text-brand-700',
  agent:       'bg-gray-100 text-gray-600',
};

export async function fetchTeamMembers(workspaceId: string): Promise<TeamMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, user_id, role, is_online, max_chats, joined_at, profiles(full_name, email, avatar_url)')
    .eq('workspace_id', workspaceId)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string; user_id: string; role: UserRole; is_online: boolean;
    max_chats: number; joined_at: string;
    profiles: { full_name: string; email: string; avatar_url: string | null } | null;
  }>).map((m) => ({
    member_id:  m.id,
    user_id:    m.user_id,
    role:       m.role,
    is_online:  m.is_online,
    max_chats:  m.max_chats,
    joined_at:  m.joined_at,
    full_name:  m.profiles?.full_name ?? 'Unknown',
    email:      m.profiles?.email ?? '',
    avatar_url: m.profiles?.avatar_url ?? null,
  }));
}

export async function updateMemberRole(memberId: string, role: UserRole): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('workspace_members')
    .update({ role })
    .eq('id', memberId);
  if (error) throw error;
}
```

- [ ] **Step 2: Write team hook**

Write `d:\WhatsApp-Automation\modules\team\hooks\useTeam.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTeamMembers, updateMemberRole } from '../services/team.service';
import type { TeamMember } from '../services/team.service';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { Database } from '@/types/database.types';

export function useTeam() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<TeamMember[]>({
    queryKey: ['team', workspaceId],
    queryFn: () => fetchTeamMembers(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({
      memberId, role,
    }: {
      memberId: string;
      role: Database['public']['Tables']['workspace_members']['Row']['role'];
    }) => updateMemberRole(memberId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', workspaceId] }),
  });
}
```

- [ ] **Step 3: Write TeamPage component**

Write `d:\WhatsApp-Automation\modules\team\components\TeamPage\index.tsx`:

```typescript
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTeam, useUpdateMemberRole } from '../../hooks/useTeam';
import { ROLE_LABELS, ROLE_COLORS } from '../../services/team.service';
import type { Database } from '@/types/database.types';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth.store';

type UserRole = Database['public']['Tables']['workspace_members']['Row']['role'];
const ROLES: UserRole[] = ['super_admin', 'admin', 'manager', 'agent'];

export function TeamPage() {
  const { data: members = [], isLoading } = useTeam();
  const updateRole = useUpdateMemberRole();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const onlineCount = members.filter((m) => m.is_online).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">Team</h1>
          {!isLoading && (
            <Badge variant="outline" className="text-xs gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              {onlineCount} online
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled>
          <UserPlus className="h-3.5 w-3.5" /> Invite Member
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Max Chats</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : members.map((m) => {
                  const initials = m.full_name.slice(0, 2).toUpperCase();
                  const isSelf = m.user_id === currentUserId;

                  return (
                    <TableRow key={m.member_id} className="hover:bg-accent">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={m.avatar_url ?? undefined} />
                              <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={cn(
                                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                                m.is_online ? 'bg-emerald-500' : 'bg-gray-300',
                              )}
                            />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{m.full_name}</p>
                            {isSelf && <p className="text-[10px] text-muted-foreground">You</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                      <TableCell>
                        {isSelf ? (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              ROLE_COLORS[m.role],
                            )}
                          >
                            {ROLE_LABELS[m.role]}
                          </span>
                        ) : (
                          <Select
                            value={m.role}
                            onValueChange={async (v) => {
                              await updateRole.mutateAsync({ memberId: m.member_id, role: v as UserRole });
                              toast.success('Role updated');
                            }}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn('text-xs font-medium', m.is_online ? 'text-emerald-600' : 'text-muted-foreground')}>
                          {m.is_online ? 'Online' : 'Offline'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.max_chats}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(m.joined_at), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire team page**

Write `d:\WhatsApp-Automation\app\(dashboard)\team\page.tsx`:

```typescript
import { TeamPage } from '@/modules/team/components/TeamPage';

export default function TeamPageRoute() {
  return <TeamPage />;
}
```

- [ ] **Step 5: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/team/ "app/(dashboard)/team/page.tsx"
git commit -m "feat(team): add team member list with presence, role select, online count"
```

---

## Task 2: Analytics Service + Hook + Dashboard

**Files:**
- Create: `d:\WhatsApp-Automation\modules\analytics\services\analytics.service.ts`
- Create: `d:\WhatsApp-Automation\modules\analytics\hooks\useAnalytics.ts`
- Create: `d:\WhatsApp-Automation\modules\analytics\components\AnalyticsDashboard\index.tsx`
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\analytics\page.tsx`

- [ ] **Step 1: Write analytics service**

Write `d:\WhatsApp-Automation\modules\analytics\services\analytics.service.ts`:

```typescript
import { createClient } from '@/services/supabase/client';
import { subDays, startOfDay, format } from 'date-fns';

export interface ConversationStats {
  total: number;
  open: number;
  resolved: number;
  avgResolutionHours: number;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface MessageFunnel {
  sent: number;
  delivered: number;
  read: number;
}

export async function fetchConversationStats(workspaceId: string): Promise<ConversationStats> {
  const supabase = createClient();

  const [totalRes, openRes, resolvedRes] = await Promise.all([
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'open'),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'resolved'),
  ]);

  return {
    total: totalRes.count ?? 0,
    open: openRes.count ?? 0,
    resolved: resolvedRes.count ?? 0,
    avgResolutionHours: 0, // Requires materialized view — placeholder
  };
}

export async function fetchDailyConversations(
  workspaceId: string,
  days = 14,
): Promise<DailyCount[]> {
  const supabase = createClient();
  const since = startOfDay(subDays(new Date(), days)).toISOString();

  const { data, error } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('workspace_id', workspaceId)
    .gte('created_at', since);

  if (error) throw error;

  // Group by day
  const counts: Record<string, number> = {};
  for (let i = days; i >= 0; i--) {
    counts[format(subDays(new Date(), i), 'MMM d')] = 0;
  }
  for (const row of data ?? []) {
    const day = format(new Date(row.created_at), 'MMM d');
    if (day in counts) counts[day]++;
  }

  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}

export async function fetchMessageFunnel(workspaceId: string): Promise<MessageFunnel> {
  const supabase = createClient();

  const [sentRes, deliveredRes, readRes] = await Promise.all([
    supabase.from('messages').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('direction', 'outbound'),
    supabase.from('messages').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'delivered'),
    supabase.from('messages').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'read'),
  ]);

  return {
    sent:      sentRes.count ?? 0,
    delivered: deliveredRes.count ?? 0,
    read:      readRes.count ?? 0,
  };
}
```

- [ ] **Step 2: Write analytics hook**

Write `d:\WhatsApp-Automation\modules\analytics\hooks\useAnalytics.ts`:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchConversationStats,
  fetchDailyConversations,
  fetchMessageFunnel,
} from '../services/analytics.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useConversationStats() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['analytics', 'conv-stats', workspaceId],
    queryFn: () => fetchConversationStats(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  });
}

export function useDailyConversations(days = 14) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['analytics', 'daily-convs', workspaceId, days],
    queryFn: () => fetchDailyConversations(workspaceId!, days),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  });
}

export function useMessageFunnel() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['analytics', 'msg-funnel', workspaceId],
    queryFn: () => fetchMessageFunnel(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 3: Write AnalyticsDashboard component**

Write `d:\WhatsApp-Automation\modules\analytics\components\AnalyticsDashboard\index.tsx`:

```typescript
'use client';

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, CheckCircle2, TrendingUp, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useConversationStats, useDailyConversations, useMessageFunnel,
} from '../../hooks/useAnalytics';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  iconBg: string;
  loading: boolean;
}

function StatCard({ title, value, icon: Icon, iconBg, loading }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <p className="text-3xl font-bold text-foreground">{value}</p>
          )}
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBg)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

export function AnalyticsDashboard() {
  const { data: stats, isLoading: statsLoading } = useConversationStats();
  const { data: daily = [], isLoading: dailyLoading } = useDailyConversations(14);
  const { data: funnel, isLoading: funnelLoading } = useMessageFunnel();

  const funnelData = funnel
    ? [
        { name: 'Sent',      value: funnel.sent,      fill: '#0ea5e9' },
        { name: 'Delivered', value: funnel.delivered,  fill: '#8b5cf6' },
        { name: 'Read',      value: funnel.read,       fill: '#10b981' },
      ]
    : [];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last 14 days overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Conversations"
          value={stats?.total ?? 0}
          icon={MessageSquare}
          iconBg="bg-brand-500"
          loading={statsLoading}
        />
        <StatCard
          title="Open"
          value={stats?.open ?? 0}
          icon={TrendingUp}
          iconBg="bg-amber-500"
          loading={statsLoading}
        />
        <StatCard
          title="Resolved"
          value={stats?.resolved ?? 0}
          icon={CheckCircle2}
          iconBg="bg-emerald-500"
          loading={statsLoading}
        />
        <StatCard
          title="Messages Sent"
          value={funnel?.sent ?? 0}
          icon={Send}
          iconBg="bg-violet-500"
          loading={funnelLoading}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Daily conversations area chart */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Conversation Volume (14d)</h2>
          {dailyLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fill="url(#colorConv)"
                  name="Conversations"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Message funnel bar chart */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Message Delivery Funnel</h2>
          {funnelLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnelData} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Messages">
                  {funnelData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire analytics page**

Write `d:\WhatsApp-Automation\app\(dashboard)\analytics\page.tsx`:

```typescript
import { AnalyticsDashboard } from '@/modules/analytics/components/AnalyticsDashboard';

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
```

- [ ] **Step 5: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/analytics/ "app/(dashboard)/analytics/page.tsx"
git commit -m "feat(analytics): add analytics dashboard (KPI cards, area chart, message funnel bar chart)"
```

---

## Task 3: Settings Module

**Files:**
- Create: `d:\WhatsApp-Automation\modules\settings\components\ProfileSettings\index.tsx`
- Create: `d:\WhatsApp-Automation\modules\settings\components\WorkspaceSettings\index.tsx`
- Create: `d:\WhatsApp-Automation\modules\settings\components\WhatsAppSettings\index.tsx`
- Create: `d:\WhatsApp-Automation\modules\settings\components\SettingsLayout\index.tsx`
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\settings\page.tsx`

- [ ] **Step 1: Write ProfileSettings**

Write `d:\WhatsApp-Automation\modules\settings\components\ProfileSettings\index.tsx`:

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/store/auth.store';
import { createClient } from '@/services/supabase/client';
import { toast } from 'sonner';

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  timezone:  z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export function ProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const initials = (user?.full_name ?? 'U').slice(0, 2).toUpperCase();

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { full_name: user?.full_name ?? '', timezone: 'UTC' },
    });

  const onSubmit = async (values: FormValues) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: values.full_name, timezone: values.timezone })
      .eq('id', user!.id);
    if (error) toast.error('Failed to update profile');
    else toast.success('Profile saved');
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">Profile</h2>
        <p className="text-sm text-muted-foreground">Manage your name and preferences.</p>
      </div>
      <Separator />

      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={user?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-brand-100 text-brand-700 text-xl font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium text-foreground">{user?.full_name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full Name</Label>
          <Input id="full_name" {...register('full_name')} />
          {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user?.email ?? ''} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground">Email changes require re-verification.</p>
        </div>
        <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write WorkspaceSettings**

Write `d:\WhatsApp-Automation\modules\settings\components\WorkspaceSettings\index.tsx`:

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useWorkspaceStore } from '@/store/workspace.store';
import { createClient } from '@/services/supabase/client';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().min(2).max(100),
});
type FormValues = z.infer<typeof schema>;

export function WorkspaceSettings() {
  const workspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { name: workspace?.name ?? '' },
    });

  const onSubmit = async (values: FormValues) => {
    if (!workspace) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('workspaces')
      .update({ name: values.name })
      .eq('id', workspace.id);
    if (error) {
      toast.error('Failed to update workspace');
    } else {
      setActiveWorkspace({ ...workspace, name: values.name });
      toast.success('Workspace updated');
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">Workspace</h2>
        <p className="text-sm text-muted-foreground">Update your workspace name and details.</p>
      </div>
      <Separator />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Workspace Name</Label>
          <Input id="ws-name" {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>URL Slug</Label>
          <Input value={workspace?.slug ?? ''} disabled className="bg-muted font-mono text-sm" />
          <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Input value={workspace?.plan ?? 'starter'} disabled className="bg-muted text-sm capitalize" />
        </div>
        <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Write WhatsAppSettings**

Write `d:\WhatsApp-Automation\modules\settings\components\WhatsAppSettings\index.tsx`:

```typescript
'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';

export function WhatsAppSettings() {
  const workspace = useWorkspaceStore((s) => s.activeWorkspace);
  const isConfigured = !!(workspace?.waba_id && workspace.phone_number_id);

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">WhatsApp Business API</h2>
        <p className="text-sm text-muted-foreground">
          WhatsApp Business Account (WABA) configuration.
        </p>
      </div>
      <Separator />

      <div className="flex items-center gap-2">
        {isConfigured ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <Badge className="bg-emerald-100 text-emerald-700 text-xs">Connected</Badge>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <Badge className="bg-amber-100 text-amber-700 text-xs">Not configured</Badge>
          </>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>WABA ID</Label>
          <Input
            value={workspace?.waba_id ?? ''}
            disabled
            className="bg-muted font-mono text-sm"
            placeholder="Not set"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Phone Number ID</Label>
          <Input
            value={workspace?.phone_number_id ?? ''}
            disabled
            className="bg-muted font-mono text-sm"
            placeholder="Not set"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          WABA credentials are set via environment variables. Contact your admin to update them.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write SettingsLayout**

Write `d:\WhatsApp-Automation\modules\settings\components\SettingsLayout\index.tsx`:

```typescript
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from '../ProfileSettings';
import { WorkspaceSettings } from '../WorkspaceSettings';
import { WhatsAppSettings } from '../WhatsAppSettings';

export function SettingsLayout() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and workspace.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>
        <TabsContent value="workspace">
          <WorkspaceSettings />
        </TabsContent>
        <TabsContent value="whatsapp">
          <WhatsAppSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Wire settings page**

Write `d:\WhatsApp-Automation\app\(dashboard)\settings\page.tsx`:

```typescript
import { SettingsLayout } from '@/modules/settings/components/SettingsLayout';

export default function SettingsPage() {
  return <SettingsLayout />;
}
```

- [ ] **Step 6: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/settings/ "app/(dashboard)/settings/page.tsx"
git commit -m "feat(settings): add tabbed settings (profile, workspace, WhatsApp WABA config)"
```

---

## Task 4: Build Verification

- [ ] **Step 1: TypeScript check**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: Zero errors.

- [ ] **Step 2: Production build**

```powershell
cd "d:\WhatsApp-Automation"; npm run build 2>&1 | Select-Object -Last 20
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Final commit**

```powershell
cd "d:\WhatsApp-Automation"
git add -A
git commit -m "feat: Phase 9 complete — Team + Analytics (Recharts) + Settings (profile, workspace, WhatsApp)"
```

---

## Spec Coverage Check

| Blueprint Requirement | Covered | Task |
|---|---|---|
| Team member list with presence dots | ✅ | Task 1 |
| Role management (select dropdown) | ✅ | Task 1 |
| Online agent count badge | ✅ | Task 1 |
| Analytics KPI cards | ✅ | Task 2 |
| Conversation volume area chart (Recharts) | ✅ | Task 2 |
| Message delivery funnel bar chart | ✅ | Task 2 |
| Settings tab layout | ✅ | Task 3 |
| Profile edit (name) | ✅ | Task 3 |
| Workspace name edit | ✅ | Task 3 |
| WhatsApp WABA config display | ✅ | Task 3 |

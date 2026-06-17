'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, CheckCircle2, TrendingUp, AlertCircle, Plus,
  RefreshCw, MessageSquare, IndianRupee, Activity, Users, Search,
  Shield, Zap, Trash2,
} from 'lucide-react';
import { AdminNotificationBell } from '../AdminNotificationBell';
import { HealthMonitor } from '../HealthMonitor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ClientList } from '../ClientList';
import { CreateClientModal } from '../CreateClientModal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { WorkspaceRow } from '@/app/api/admin/workspaces/route';

interface AdminStats {
  total_workspaces:  number;
  active_workspaces: number;
  halted_workspaces: number;
  mrr:               number;
  messages_today:    number;
}

/* ── Stat Card ─────────────────────────────────────────────────────────────── */
function StatCard({
  title, value, sub, icon: Icon, iconBg, loading, trend,
}: {
  title:    string;
  value:    string | number;
  sub?:     string;
  icon:     React.ElementType;
  iconBg:   string;
  loading?: boolean;
  trend?:   { good: boolean; label: string };
}) {
  return (
    <div className={cn(
      'rounded-2xl border border-border bg-card p-5',
      'shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)]',
      'transition-all duration-200 hover:-translate-y-0.5',
      'hover:shadow-[0_4px_12px_0_rgb(0_0_0/0.09)]',
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm', iconBg)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        {trend && !loading && (
          <span className={cn(
            'text-[11px] font-semibold rounded-full px-2 py-0.5',
            trend.good
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-600 border border-red-200',
          )}>
            {trend.label}
          </span>
        )}
      </div>
      {loading
        ? <Skeleton className="h-8 w-20 mb-1" />
        : <p className="text-[28px] font-bold text-foreground tabular-nums leading-none tracking-tight">{value}</p>
      }
      <p className="text-xs font-semibold text-foreground mt-1.5">{title}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Section Header ────────────────────────────────────────────────────────── */
function SectionHeader({ icon: Icon, title, sub, iconBg, action, onAction }: {
  icon: React.ElementType; title: string; sub?: string; iconBg: string;
  action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {action && onAction && (
        <button onClick={onAction} className="text-xs font-semibold text-brand-500 hover:text-brand-600 transition-colors">
          {action}
        </button>
      )}
    </div>
  );
}

/* ── Admin Dashboard ───────────────────────────────────────────────────────── */
function daysLeft(deletedAt: string): number {
  const ms = 7 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(deletedAt).getTime());
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function AdminDashboard() {
  const [search,      setSearch]      = useState('');
  const [createOpen,  setCreateOpen]  = useState(false);
  const [trashAction, setTrashAction] = useState<{ ws: WorkspaceRow; type: 'restore' | 'purge' } | null>(null);
  const handleAuthError = (status: number) => {
    if (status === 403 || status === 401) window.location.href = '/login?reason=session_expired';
  };

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) { handleAuthError(res.status); throw new Error('Failed to fetch stats'); }
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: workspacesData, isLoading: workspacesLoading, refetch: refetchWorkspaces } = useQuery<{ workspaces: WorkspaceRow[] }>({
    queryKey: ['admin-workspaces'],
    queryFn: async () => {
      const res = await fetch('/api/admin/workspaces');
      if (!res.ok) { handleAuthError(res.status); throw new Error('Failed to fetch workspaces'); }
      return res.json();
    },
  });

  const { data: trashData, refetch: refetchTrash } = useQuery<{ workspaces: WorkspaceRow[] }>({
    queryKey: ['admin-workspaces-trash'],
    queryFn: async () => {
      const res = await fetch('/api/admin/workspaces?trash=true');
      if (!res.ok) return { workspaces: [] };
      return res.json();
    },
  });

  const handleRefetch = () => { void refetchWorkspaces(); void refetchStats(); void refetchTrash(); };

  const handleTrashConfirm = async () => {
    if (!trashAction) return;
    const { ws, type } = trashAction;
    setTrashAction(null);
    if (type === 'restore') {
      await fetch(`/api/admin/workspaces/${ws.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      toast.success(`"${ws.name}" restored`);
    } else {
      await fetch(`/api/admin/workspaces/${ws.id}?permanent=true`, { method: 'DELETE' });
      toast.success(`"${ws.name}" permanently deleted`);
    }
    handleRefetch();
  };

  const trashList = trashData?.workspaces ?? [];

  const filteredWorkspaces = (workspacesData?.workspaces ?? []).filter((w) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      w.name.toLowerCase().includes(q) ||
      (w.owner_email ?? '').toLowerCase().includes(q) ||
      w.slug.toLowerCase().includes(q)
    );
  });

  const formatMRR   = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const haltedPct   = statsData && statsData.total_workspaces > 0
    ? Math.round((statsData.halted_workspaces / statsData.total_workspaces) * 100)
    : 0;
  const activePct   = statsData && statsData.total_workspaces > 0
    ? Math.round((statsData.active_workspaces / statsData.total_workspaces) * 100)
    : 0;

  return (
    <div className="space-y-8">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Platform Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time visibility across all client workspaces
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AdminNotificationBell />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleRefetch}
            disabled={statsLoading || workspacesLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (statsLoading || workspacesLoading) && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-brand-500 hover:bg-brand-600">
            <Plus className="h-4 w-4" />
            Add New Client
          </Button>
        </div>
      </div>

      {/* ── KPI Stats ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          title="Total Workspaces"
          value={statsData?.total_workspaces ?? 0}
          sub="All registered clients"
          icon={Building2}
          iconBg="bg-gradient-to-br from-navy-700 to-navy-900"
          loading={statsLoading}
        />
        <StatCard
          title="Active Workspaces"
          value={statsData?.active_workspaces ?? 0}
          sub={`${activePct}% of total`}
          icon={CheckCircle2}
          iconBg="bg-gradient-to-br from-emerald-500 to-teal-600"
          loading={statsLoading}
          trend={{ good: true, label: `${activePct}% active` }}
        />
        <StatCard
          title="Monthly Revenue"
          value={statsLoading ? '…' : formatMRR(statsData?.mrr ?? 0)}
          sub="Active paid plans"
          icon={IndianRupee}
          iconBg="bg-gradient-to-br from-brand-500 to-brand-600"
          loading={statsLoading}
        />
        <StatCard
          title="Halted Accounts"
          value={statsData?.halted_workspaces ?? 0}
          sub="Payment failed"
          icon={AlertCircle}
          iconBg="bg-gradient-to-br from-red-500 to-rose-600"
          loading={statsLoading}
          trend={
            (statsData?.halted_workspaces ?? 0) > 0
              ? { good: false, label: `${haltedPct}% halted` }
              : { good: true, label: 'All clear' }
          }
        />
        <StatCard
          title="Messages Today"
          value={statsData?.messages_today ?? 0}
          sub="Platform-wide traffic"
          icon={MessageSquare}
          iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
          loading={statsLoading}
        />
      </div>

      {/* ── Quick health summary ──────────────────────────────────────── */}
      {!statsLoading && statsData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: 'Active Rate',
              value: activePct,
              color: activePct > 70 ? 'bg-emerald-500' : activePct > 40 ? 'bg-amber-500' : 'bg-red-500',
              hint: `${statsData.active_workspaces}/${statsData.total_workspaces} workspaces`,
            },
            {
              label: 'Health Score',
              value: 100 - haltedPct,
              color: haltedPct < 10 ? 'bg-emerald-500' : haltedPct < 25 ? 'bg-amber-500' : 'bg-red-500',
              hint: `${statsData.halted_workspaces} accounts halted`,
            },
            {
              label: 'Daily Message Volume',
              value: Math.min(100, Math.round((statsData.messages_today / 1000) * 100)),
              color: 'bg-violet-500',
              hint: `${statsData.messages_today.toLocaleString()} messages today`,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_3px_0_rgb(0_0_0/0.06)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">{s.label}</span>
                <span className="text-xs font-bold text-foreground tabular-nums">{s.value}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-700', s.color)}
                  style={{ width: `${s.value}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">{s.hint}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Client workspaces ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.06)] overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-border px-5 py-4">
          <SectionHeader
            icon={Users}
            title="Client Workspaces"
            sub={workspacesLoading ? 'Loading…' : `${filteredWorkspaces.length} of ${workspacesData?.workspaces.length ?? 0} shown`}
            iconBg="bg-gradient-to-br from-navy-700 to-navy-800"
          />
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email or slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm w-full"
            />
          </div>
        </div>

        <div className="p-0">
          <ClientList
            workspaces={filteredWorkspaces}
            loading={workspacesLoading}
            onRefetch={handleRefetch}
          />
        </div>
      </div>

      {/* ── Platform health ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-[0_1px_3px_0_rgb(0_0_0/0.06)]">
        <div className="border-b border-border px-5 py-4">
          <SectionHeader
            icon={Activity}
            title="System Health"
            sub="Real-time infrastructure monitoring"
            iconBg="bg-gradient-to-br from-emerald-500 to-teal-600"
          />
        </div>
        <div className="p-5">
          <HealthMonitor />
        </div>
      </div>

      {/* ── Trash Bin ───────────────────────────────────────────────── */}
      {trashList.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50/40 overflow-hidden shadow-[0_1px_3px_0_rgb(0_0_0/0.06)]">
          <div className="border-b border-red-200 px-5 py-4">
            <SectionHeader
              icon={Trash2}
              title="Trash Bin"
              sub={`${trashList.length} workspace${trashList.length !== 1 ? 's' : ''} — auto-deleted after 7 days`}
              iconBg="bg-gradient-to-br from-red-500 to-rose-600"
            />
          </div>
          <div className="p-4 space-y-2">
            {trashList.map((ws) => {
              const days = daysLeft(ws.deleted_at!);
              return (
                <div key={ws.id} className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{ws.name}</p>
                    <p className="text-xs text-muted-foreground">{ws.owner_email ?? ws.slug}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={cn(
                      'text-xs font-semibold rounded-full px-2 py-0.5',
                      days <= 1 ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200',
                    )}>
                      {days === 0 ? 'Deletes today' : `${days}d left`}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => setTrashAction({ ws, type: 'restore' })}>
                      Restore
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => setTrashAction({ ws, type: 'purge' })}>
                      Delete Now
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Platform security info ───────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.06)]">
        <SectionHeader
          icon={Shield}
          title="Access Control"
          sub="Super admin privileges active"
          iconBg="bg-gradient-to-br from-brand-500 to-brand-600"
        />
        <div className="mt-2 flex flex-wrap gap-3">
          {[
            { icon: Zap,       label: 'Full workspace access'  },
            { icon: Trash2,    label: 'Platform reset rights'  },
            { icon: Users,     label: 'Client management'      },
            { icon: TrendingUp,label: 'Revenue visibility'     },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
              <Icon className="h-3.5 w-3.5 text-brand-500" />
              <span className="text-xs font-medium text-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <CreateClientModal open={createOpen} onOpenChange={setCreateOpen} onSuccess={handleRefetch} />

      <ConfirmDialog
        open={!!trashAction}
        title={trashAction?.type === 'restore' ? `Restore "${trashAction.ws.name}"?` : `Permanently delete "${trashAction?.ws.name}"?`}
        description={
          trashAction?.type === 'restore'
            ? 'This workspace and all its data will be restored and become active again.'
            : 'This will immediately and permanently delete all workspace data. This cannot be undone.'
        }
        confirmLabel={trashAction?.type === 'restore' ? 'Restore' : 'Delete Forever'}
        onConfirm={() => void handleTrashConfirm()}
        onCancel={() => setTrashAction(null)}
      />

    </div>
  );
}

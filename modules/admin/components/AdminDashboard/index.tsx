'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  IndianRupee, Users, MessageSquare, AlertCircle,
  TrendingUp, Plus, ArrowRight, CheckCircle2, Clock,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateClientModal } from '../CreateClientModal';
import { cn } from '@/lib/utils';

interface AdminStats {
  total_workspaces:  number;
  active_workspaces: number;
  halted_workspaces: number;
  mrr:               number;
  messages_today:    number;
}

function KpiCard({ title, value, sub, icon: Icon, color, loading }: {
  title: string; value: string; sub: string;
  icon: React.ElementType; color: string; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4', color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      {loading
        ? <Skeleton className="h-8 w-24 mb-1" />
        : <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      }
      <p className="text-sm font-semibold text-gray-700 mt-1">{title}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => fetch('/api/admin/stats').then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: wsData, refetch: refetchWorkspaces } = useQuery({
    queryKey: ['admin-workspaces'],
    queryFn: () => fetch('/api/admin/workspaces').then(r => r.json()),
  });

  const workspaces = (wsData?.workspaces ?? []) as Array<Record<string, unknown>>;
  const recent = workspaces.slice(0, 5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const halted = workspaces.filter((w: any) => w.subscription_status === 'halted').slice(0, 5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending = workspaces.filter((w: any) => w.subscription_status === 'pending_approval').slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Platform overview — all workspaces</p>
        </div>
        <Button onClick={() => setShowCreate(true)}
          className="gap-2 text-white"
          style={{ backgroundColor: '#F97316' }}>
          <Plus className="h-4 w-4" /> New Client
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Monthly Revenue" value={`₹${(stats?.mrr ?? 0).toLocaleString('en-IN')}`}
          sub="Active paid plans" icon={IndianRupee} color="bg-[#F97316]" loading={statsLoading} />
        <KpiCard title="Active Clients" value={String(stats?.active_workspaces ?? 0)}
          sub={`of ${stats?.total_workspaces ?? 0} total`} icon={CheckCircle2} color="bg-emerald-500" loading={statsLoading} />
        <KpiCard title="Messages (Month)" value={(stats?.messages_today ?? 0).toLocaleString()}
          sub="Platform-wide" icon={MessageSquare} color="bg-blue-500" loading={statsLoading} />
        <KpiCard title="Halted Accounts" value={String(stats?.halted_workspaces ?? 0)}
          sub="Payment failed" icon={AlertCircle} color="bg-red-500" loading={statsLoading} />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { label: '+ New Client', action: () => setShowCreate(true), orange: true },
            { label: 'All Clients', action: () => router.push('/admin/clients') },
            { label: 'Meta Billing', action: () => router.push('/admin/meta-billing') },
            { label: 'Open Tickets', action: () => router.push('/admin/support') },
            { label: 'System Health', action: () => router.push('/admin/health') },
          ].map(({ label, action, orange }) => (
            <Button key={label} size="sm" variant={orange ? 'default' : 'outline'}
              className={cn('text-xs h-8', orange && 'text-white')}
              style={orange ? { backgroundColor: '#F97316' } : {}}
              onClick={action}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Two-column: Recent + Alerts */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent Clients */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent Clients</h2>
            <button onClick={() => router.push('/admin/clients')}
              className="text-xs flex items-center gap-1 text-gray-400 hover:text-gray-600">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {recent.map((ws: any) => (
              <div key={ws.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-500">
                    {ws.name?.[0]?.toUpperCase() ?? 'W'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{ws.name}</p>
                    <p className="text-xs text-gray-400">{ws.owner_email ?? '—'}</p>
                  </div>
                </div>
                <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium',
                  ws.plan === 'enterprise' ? 'bg-amber-50 text-amber-700' :
                  ws.plan === 'pro' ? 'bg-violet-50 text-violet-700' :
                  ws.plan === 'starter' ? 'bg-blue-50 text-blue-700' :
                  'bg-gray-50 text-gray-500')}>
                  {ws.plan ?? 'free'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Alerts</h2>
          <div className="space-y-3">
            {halted.length === 0 && pending.length === 0 && (
              <div className="text-center py-6">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">All systems normal</p>
              </div>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {halted.map((ws: any) => (
              <div key={ws.id} className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-red-700">{ws.name}</p>
                  <p className="text-xs text-red-500">Payment failed — account halted</p>
                </div>
              </div>
            ))}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {pending.map((ws: any) => (
              <div key={ws.id} className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-700">{ws.name}</p>
                  <p className="text-xs text-amber-600">Pending approval</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CreateClientModal
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={() => { void refetchWorkspaces(); }}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  IndianRupee, Users, MessageSquare, Zap, AlertCircle, TrendingUp,
  Plus, ArrowRight, ArrowUp, Megaphone, Activity, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateClientModal } from '../CreateClientModal';
import { RevenueChart } from '../charts/RevenueChart';
import { MessageVolumeChart } from '../charts/MessageVolumeChart';
import { ClientGrowthChart } from '../charts/ClientGrowthChart';
import { PlanDistributionChart } from '../charts/PlanDistributionChart';
import { cn } from '@/lib/utils';

interface DashboardAnalytics {
  kpis: {
    total_workspaces: number;
    active_workspaces: number;
    halted_workspaces: number;
    mrr: number;
    arr: number;
    messages_this_month: number;
    campaigns_this_month: number;
    new_clients_7d: number;
    avg_health_score: number;
  };
  revenue_trend:      Array<{ month: string; mrr: number; clients: number }>;
  message_volume:     Array<{ date: string; sent: number; received: number }>;
  client_growth:      Array<{ month: string; new: number; total: number }>;
  plan_distribution:  Array<{ plan: string; count: number; revenue: number }>;
  top_clients:        Array<{ id: string; name: string; plan: string; messages: number; health: number }>;
}

const PLAN_COLORS: Record<string, string> = {
  enterprise: 'bg-amber-100 text-amber-700',
  pro:        'bg-violet-100 text-violet-700',
  starter:    'bg-blue-100 text-blue-700',
  free:       'bg-gray-100 text-gray-500',
};

function KpiCard({ title, value, sub, icon: Icon, color, trend, loading }: {
  title: string; value: string; sub?: string; icon: React.ElementType;
  color: string; trend?: { value: string; up: boolean }; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4', color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      {loading
        ? <Skeleton className="h-8 w-24 mb-1" />
        : <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      }
      <p className="text-sm font-semibold text-gray-700 mt-1">{title}</p>
      <div className="flex items-center justify-between mt-0.5">
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
        {trend && !loading && (
          <span className={cn('flex items-center gap-0.5 text-xs font-semibold', trend.up ? 'text-emerald-600' : 'text-red-500')}>
            <ArrowUp className={cn('h-3 w-3', !trend.up && 'rotate-180')} />{trend.value}
          </span>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {sub && <p className="text-xs text-gray-400 mt-0.5 mb-3">{sub}</p>}
      {children}
    </div>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch } = useQuery<DashboardAnalytics>({
    queryKey: ['admin', 'analytics', 'dashboard'],
    queryFn: () => fetch('/api/admin/analytics/dashboard').then(r => r.json()),
    refetchInterval: 5 * 60_000,  // 5 minutes — admin analytics don't need real-time
    staleTime:       5 * 60_000,
  });

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Platform overview — all workspaces</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 text-white" style={{ backgroundColor: '#F97316' }}>
          <Plus className="h-4 w-4" /> New Client
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Monthly Revenue"
          value={`₹${(kpis?.mrr ?? 0).toLocaleString('en-IN')}`}
          sub={`ARR ₹${((kpis?.arr ?? 0) / 1000).toFixed(0)}k`}
          icon={IndianRupee}
          color="bg-[#F97316]"
          loading={isLoading}
          trend={{ value: `₹${((kpis?.arr ?? 0) / 1000).toFixed(0)}k ARR`, up: true }}
        />
        <KpiCard
          title="Active Clients"
          value={String(kpis?.active_workspaces ?? 0)}
          sub={`${kpis?.new_clients_7d ?? 0} new this week`}
          icon={Users}
          color="bg-emerald-500"
          loading={isLoading}
          trend={{ value: `+${kpis?.new_clients_7d ?? 0} this week`, up: true }}
        />
        <KpiCard
          title="Messages (Month)"
          value={(kpis?.messages_this_month ?? 0).toLocaleString()}
          sub={`${kpis?.campaigns_this_month ?? 0} campaigns`}
          icon={MessageSquare}
          color="bg-blue-500"
          loading={isLoading}
        />
        <KpiCard
          title="Avg Health Score"
          value={`${kpis?.avg_health_score ?? 0}/100`}
          sub={`${kpis?.halted_workspaces ?? 0} halted accounts`}
          icon={Activity}
          color={kpis?.avg_health_score && kpis.avg_health_score > 60 ? 'bg-emerald-500' : 'bg-red-500'}
          loading={isLoading}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Revenue Trend" sub="Monthly Recurring Revenue — last 6 months">
          {isLoading ? <Skeleton className="h-52 w-full" /> : <RevenueChart data={data?.revenue_trend ?? []} />}
        </ChartCard>
        <ChartCard title="Message Volume" sub="Sent vs Received — last 6 months">
          {isLoading ? <Skeleton className="h-52 w-full" /> : <MessageVolumeChart data={data?.message_volume ?? []} />}
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard title="Client Growth" sub="Cumulative clients over time">
            {isLoading ? <Skeleton className="h-48 w-full" /> : <ClientGrowthChart data={data?.client_growth ?? []} />}
          </ChartCard>
        </div>
        <ChartCard title="Plan Distribution" sub="Clients by subscription tier">
          {isLoading ? <Skeleton className="h-48 w-full" /> : <PlanDistributionChart data={data?.plan_distribution ?? []} />}
        </ChartCard>
      </div>

      {/* Bottom Row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top Clients */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">Top Clients by Usage</h3>
            <button
              onClick={() => router.push('/admin/clients')}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {isLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="space-y-2">
              {(data?.top_clients ?? []).map(c => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/admin/clients/${c.id}`)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-orange-50/40 cursor-pointer transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-500 shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.messages.toLocaleString()} messages</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium', PLAN_COLORS[c.plan] ?? 'bg-gray-100 text-gray-500')}>
                      {c.plan}
                    </span>
                    <span className={cn('text-xs font-bold', c.health > 70 ? 'text-emerald-600' : c.health > 40 ? 'text-amber-600' : 'text-red-500')}>
                      {c.health}
                    </span>
                  </div>
                </div>
              ))}
              {(data?.top_clients ?? []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No usage data yet — run &quot;Sync All WABAs&quot;</p>
              )}
            </div>
          )}
        </div>

        {/* Alerts + Quick Actions */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '+ New Client',      action: () => setShowCreate(true),                    orange: true  },
                { label: 'All Clients',       action: () => router.push('/admin/clients'),           orange: false },
                { label: 'Meta Billing',      action: () => router.push('/admin/meta-billing'),      orange: false },
                { label: 'Send Announcement', action: () => router.push('/admin/communications'),    orange: false },
                { label: 'Revenue Report',    action: () => router.push('/admin/revenue'),           orange: false },
                { label: 'System Health',     action: () => router.push('/admin/health'),            orange: false },
              ].map(({ label, action, orange }) => (
                <Button
                  key={label}
                  size="sm"
                  variant={orange ? 'default' : 'outline'}
                  className={cn('text-xs h-8 w-full justify-start', orange && 'text-white')}
                  style={orange ? { backgroundColor: '#F97316' } : {}}
                  onClick={action}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Alerts */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Alerts</h3>
            {kpis?.halted_workspaces === 0 ? (
              <p className="text-xs text-gray-400 py-2">&#10003; All systems normal</p>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-700">
                    {kpis?.halted_workspaces} Halted Account{(kpis?.halted_workspaces ?? 0) > 1 ? 's' : ''}
                  </p>
                  <button onClick={() => router.push('/admin/clients')} className="text-xs text-red-500 underline">
                    View &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateClientModal
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={() => { void refetch(); }}
      />
    </div>
  );
}

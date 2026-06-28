'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { RevenueChart } from '../charts/RevenueChart';
import { PlanDistributionChart } from '../charts/PlanDistributionChart';
import { IndianRupee, TrendingUp, TrendingDown, Users } from 'lucide-react';

interface DashboardAnalytics {
  kpis: { mrr: number; arr: number; active_workspaces: number; halted_workspaces: number; new_clients_7d: number };
  revenue_trend: Array<{ month: string; mrr: number; clients: number }>;
  plan_distribution: Array<{ plan: string; count: number; revenue: number }>;
  top_clients: Array<{ id: string; name: string; plan: string; messages: number; health: number }>;
}

export function RevenueDashboard() {
  const { data, isLoading } = useQuery<DashboardAnalytics>({
    queryKey: ['admin', 'analytics', 'dashboard'],
    queryFn: () => fetch('/api/admin/analytics/dashboard').then(r => r.json()),
  });

  const kpis = data?.kpis;

  return (
    <div className="space-y-5">
      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'MRR', value: `₹${(kpis?.mrr ?? 0).toLocaleString('en-IN')}`, icon: IndianRupee, color: 'bg-[#F97316]' },
          { label: 'ARR', value: `₹${((kpis?.arr ?? 0)/100000).toFixed(1)}L`, icon: TrendingUp, color: 'bg-emerald-500' },
          { label: 'Paying Clients', value: String(kpis?.active_workspaces ?? 0), icon: Users, color: 'bg-blue-500' },
          { label: 'Halted (Risk)', value: String(kpis?.halted_workspaces ?? 0), icon: TrendingDown, color: 'bg-red-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${color}`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            {isLoading ? <Skeleton className="h-7 w-20" /> : <p className="text-2xl font-bold text-gray-900">{value}</p>}
            <p className="text-sm text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Revenue Trend */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Revenue Trend — Last 6 Months</h3>
        <p className="text-xs text-gray-400 mb-4">Monthly Recurring Revenue growth</p>
        {isLoading ? <Skeleton className="h-52 w-full" /> : <RevenueChart data={data?.revenue_trend ?? []} />}
      </div>

      {/* Plan Revenue Breakdown */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Revenue by Plan</h3>
          {isLoading ? <Skeleton className="h-48 w-full" /> : <PlanDistributionChart data={data?.plan_distribution ?? []} />}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Plan Revenue Detail</h3>
          <div className="space-y-2">
            {(data?.plan_distribution ?? []).map(p => (
              <div key={p.plan} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-700 capitalize">{p.plan}</span>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">₹{p.revenue.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-gray-400">{p.count} clients</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IndianRupee, TrendingUp, TrendingDown, Users, ArrowUpRight,
  AlertCircle, CheckCircle2, Calendar, BarChart3, ChevronRight,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

interface DashboardAnalytics {
  kpis: {
    mrr: number; arr: number; active_workspaces: number;
    halted_workspaces: number; new_clients_7d: number; total_workspaces: number;
  };
  revenue_trend:    Array<{ month: string; mrr: number; clients: number }>;
  plan_distribution: Array<{ plan: string; count: number; revenue: number }>;
  top_clients:      Array<{ id: string; name: string; plan: string; messages: number; health: number }>;
}

const PLAN_COLORS: Record<string, string> = {
  enterprise: '#F97316', pro: '#8B5CF6', starter: '#2563EB', free: '#9CA3AF',
};
const PLAN_BADGE: Record<string, string> = {
  enterprise: 'bg-amber-100 text-amber-700', pro: 'bg-violet-100 text-violet-700',
  starter: 'bg-blue-100 text-blue-700', free: 'bg-gray-100 text-gray-500',
};

function MrrTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-medium">
          {p.dataKey === 'mrr' ? `MRR: ₹${p.value.toLocaleString('en-IN')}` : `Clients: ${p.value}`}
        </p>
      ))}
    </div>
  );
}

export function RevenueDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading } = useQuery<DashboardAnalytics>({
    queryKey: ['admin', 'analytics', 'dashboard'],
    queryFn:  () => fetch('/api/admin/analytics/dashboard').then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const kpis = data?.kpis;
  const trend = data?.revenue_trend ?? [];
  const dist  = data?.plan_distribution ?? [];
  const clients = data?.top_clients ?? [];

  // Revenue growth: compare last month vs prev month
  const lastMrr = trend[trend.length - 1]?.mrr ?? 0;
  const prevMrr = trend[trend.length - 2]?.mrr ?? 0;
  const growth  = prevMrr > 0 ? Math.round(((lastMrr - prevMrr) / prevMrr) * 100) : 0;

  // ARPU: MRR / paying clients
  const arpu = (kpis?.active_workspaces ?? 0) > 0
    ? Math.round((kpis?.mrr ?? 0) / (kpis?.active_workspaces ?? 1))
    : 0;

  const kpiCards = [
    {
      label: 'Monthly Revenue', value: `₹${(kpis?.mrr ?? 0).toLocaleString('en-IN')}`,
      sub: growth > 0 ? `↑ ${growth}% vs last month` : growth < 0 ? `↓ ${Math.abs(growth)}% vs last month` : 'No change',
      subColor: growth > 0 ? 'text-emerald-600' : growth < 0 ? 'text-red-500' : 'text-gray-400',
      icon: IndianRupee, color: 'bg-[#F97316]',
    },
    {
      label: 'Annual Run Rate', value: `₹${((kpis?.arr ?? 0) / 100000).toFixed(1)}L`,
      sub: `₹${(kpis?.arr ?? 0).toLocaleString('en-IN')} per year`,
      subColor: 'text-gray-400', icon: TrendingUp, color: 'bg-emerald-500',
    },
    {
      label: 'ARPU', value: `₹${arpu.toLocaleString('en-IN')}`,
      sub: 'Avg revenue per client',
      subColor: 'text-gray-400', icon: Users, color: 'bg-blue-500',
    },
    {
      label: 'Paying Clients', value: String(kpis?.active_workspaces ?? 0),
      sub: `+${kpis?.new_clients_7d ?? 0} new this week`,
      subColor: 'text-emerald-600', icon: CheckCircle2, color: 'bg-violet-500',
    },
    {
      label: 'At Risk', value: String(kpis?.halted_workspaces ?? 0),
      sub: (kpis?.halted_workspaces ?? 0) > 0 ? 'Payment failed — take action' : 'All accounts healthy',
      subColor: (kpis?.halted_workspaces ?? 0) > 0 ? 'text-red-500' : 'text-emerald-600',
      icon: AlertCircle, color: (kpis?.halted_workspaces ?? 0) > 0 ? 'bg-red-500' : 'bg-gray-400',
    },
    {
      label: 'Revenue Growth', value: `${growth > 0 ? '+' : ''}${growth}%`,
      sub: 'Month over month',
      subColor: growth > 0 ? 'text-emerald-600' : growth < 0 ? 'text-red-500' : 'text-gray-400',
      icon: BarChart3, color: growth >= 0 ? 'bg-emerald-500' : 'bg-red-500',
    },
  ];

  return (
    <div className="space-y-5">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpiCards.map(({ label, value, sub, subColor, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4 ${color}`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            {isLoading ? <Skeleton className="h-8 w-24 mb-1" /> : (
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
            )}
            <p className="text-sm font-semibold text-gray-700 mt-1">{label}</p>
            <p className={`text-xs mt-0.5 ${subColor}`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Revenue Trend</h3>
            <p className="text-xs text-gray-400 mt-0.5">Monthly Recurring Revenue — last 6 months</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Calendar className="h-3.5 w-3.5" /> Last 6 months
          </div>
        </div>
        {isLoading || !mounted ? <Skeleton className="h-56 w-full" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<MrrTooltip />} />
              <Line type="monotone" dataKey="mrr" stroke="#F97316" strokeWidth={3} dot={{ fill: '#F97316', r: 4 }} name="mrr" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Plan Distribution + Revenue per plan */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Donut chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Revenue by Plan</h3>
          <p className="text-xs text-gray-400 mb-3">Monthly contribution per tier</p>
          {isLoading || !mounted ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={dist.filter(d => d.revenue > 0)} cx="50%" cy="50%"
                  innerRadius={50} outerRadius={75} paddingAngle={3}
                  dataKey="revenue" nameKey="plan">
                  {dist.map(entry => (
                    <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] ?? '#6B7280'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }}
                  formatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue table per plan */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Plan Breakdown</h3>
          <div className="space-y-3">
            {dist.length === 0 && isLoading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
              : dist.map(p => {
                  const pct = (kpis?.mrr ?? 0) > 0 ? Math.round((p.revenue / (kpis?.mrr ?? 1)) * 100) : 0;
                  return (
                    <div key={p.plan} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PLAN_COLORS[p.plan] ?? '#6B7280' }} />
                          <span className="text-sm font-medium text-gray-700 capitalize">{p.plan}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PLAN_BADGE[p.plan] ?? ''}`}>{p.count}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-gray-900">₹{p.revenue.toLocaleString('en-IN')}</span>
                          <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: PLAN_COLORS[p.plan] ?? '#6B7280' }} />
                      </div>
                    </div>
                  );
              })
            }
            {dist.length > 0 && (
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">Total MRR</span>
                <span className="text-lg font-bold" style={{ color: '#F97316' }}>
                  ₹{(kpis?.mrr ?? 0).toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Client Revenue Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Revenue by Client</h3>
            <p className="text-xs text-gray-400 mt-0.5">Top clients sorted by plan value</p>
          </div>
          <button onClick={() => router.push('/admin/clients')}
            className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium">
            View all <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monthly</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Annual</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Health</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {clients.map(c => {
              const planRevenue = dist.find(d => d.plan === c.plan)?.revenue ?? 0;
              const clientRevenue = clients.filter(x => x.plan === c.plan).length > 0
                ? Math.round(planRevenue / clients.filter(x => x.plan === c.plan).length)
                : 0;
              return (
                <tr key={c.id}
                  className="border-b border-gray-50 hover:bg-orange-50/20 cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/clients/${c.id}`)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-500 shrink-0">
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${PLAN_BADGE[c.plan] ?? ''}`}>
                      {c.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    ₹{clientRevenue.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    ₹{(clientRevenue * 12).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <div className="h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${c.health > 70 ? 'bg-emerald-500' : c.health > 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${c.health}%` }} />
                      </div>
                      <span className={`text-xs font-semibold ${c.health > 70 ? 'text-emerald-600' : c.health > 40 ? 'text-amber-600' : 'text-red-500'}`}>
                        {c.health}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ArrowUpRight className="h-4 w-4 text-gray-300" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {clients.length === 0 && !isLoading && (
          <p className="text-center text-sm text-gray-400 py-8">No revenue data available</p>
        )}
      </div>
    </div>
  );
}

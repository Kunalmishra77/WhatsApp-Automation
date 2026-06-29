'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Users, Send, Activity, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

export default function AnalyticsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'dashboard'],
    queryFn:  () => fetch('/api/admin/analytics/dashboard').then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const kpis = data?.kpis ?? {};
  const msgVol   = data?.message_volume ?? [];
  const growth   = data?.client_growth  ?? [];
  const topClients = data?.top_clients ?? [];

  const totalMsg   = msgVol.reduce((a: number, m: any) => a + (m.sent ?? 0) + (m.received ?? 0), 0);
  const totalSent  = msgVol.reduce((a: number, m: any) => a + (m.sent ?? 0), 0);
  const totalRecv  = msgVol.reduce((a: number, m: any) => a + (m.received ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Analytics</h1>
        <p className="text-sm text-gray-400 mt-0.5">Usage, growth and performance across all clients</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Messages', value: kpis.messages_this_month?.toLocaleString() ?? '0', icon: MessageSquare, color: 'bg-[#F97316]', sub: 'All time' },
          { label: 'Bot Sent', value: totalSent.toLocaleString(), icon: Send, color: 'bg-blue-500', sub: 'Last 6 months' },
          { label: 'Inbound', value: totalRecv.toLocaleString(), icon: TrendingUp, color: 'bg-emerald-500', sub: 'Customer messages' },
          { label: 'Active Clients', value: String(kpis.active_workspaces ?? 0), icon: Users, color: 'bg-violet-500', sub: 'Paying this month' },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl mb-3 ${color}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            {isLoading ? <Skeleton className="h-7 w-20" /> : <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>}
            <p className="text-sm font-medium text-gray-700 mt-1">{label}</p>
            <p className="text-xs text-gray-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800">Message Volume</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">Bot sent vs customer received — last 6 months</p>
          {isLoading || !mounted ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={msgVol} barSize={10} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="sent"     fill="#F97316" radius={[3,3,0,0]} name="Bot Sent" />
                <Bar dataKey="received" fill="#2563EB" radius={[3,3,0,0]} name="Inbound" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800">Client Growth</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">Cumulative clients over time</p>
          {isLoading || !mounted ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={growth} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="totalG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#F97316" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }} />
                <Area type="monotone" dataKey="total" stroke="#F97316" strokeWidth={2.5} fill="url(#totalG)" name="Total Clients" />
                <Area type="monotone" dataKey="new"   stroke="#16A34A" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="New This Month" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Clients Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Client Performance Rankings</h3>
          <p className="text-xs text-gray-400 mt-0.5">Sorted by all-time message activity</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Messages</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Health Score</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {topClients.map((c: any, idx: number) => (
              <tr key={c.id}
                className="border-b border-gray-50 hover:bg-orange-50/20 cursor-pointer transition-colors"
                onClick={() => router.push(`/admin/clients/${c.id}`)}>
                <td className="px-5 py-3 text-gray-400 font-medium text-xs">#{idx + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-500 shrink-0">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-800">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{c.messages.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs rounded-full bg-orange-50 text-orange-700 px-2 py-0.5 capitalize font-medium">{c.plan}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-1.5 w-20 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${c.health > 70 ? 'bg-emerald-500' : c.health > 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${c.health}%` }} />
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${c.health > 70 ? 'text-emerald-600' : c.health > 40 ? 'text-amber-600' : 'text-red-500'}`}>
                      {c.health}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Users, MessageCircle, Send, Activity } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

interface Props {
  workspaceId: string;
  workspace:   Record<string, unknown>;
}

function KpiMini({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <div className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg mb-2', color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export function OverviewTab({ workspaceId }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'client-analytics', workspaceId],
    queryFn:  () => fetch(`/api/admin/analytics/client/${workspaceId}`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  if (isLoading || !mounted) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const kpis = data?.kpis;
  const healthScore = kpis?.health_score ?? 0;
  const healthColor =
    healthScore > 70 ? 'text-emerald-600' :
    healthScore > 40 ? 'text-amber-600'   : 'text-red-500';
  const healthBg =
    healthScore > 70 ? 'bg-emerald-50 border-emerald-200' :
    healthScore > 40 ? 'bg-amber-50 border-amber-200'     : 'bg-red-50 border-red-200';
  const healthBar =
    healthScore > 70 ? 'bg-emerald-500' :
    healthScore > 40 ? 'bg-amber-500'   : 'bg-red-500';

  return (
    <div className="space-y-5">
      {/* Health Score Banner */}
      <div className={cn('flex items-center gap-3 p-4 rounded-xl border', healthBg)}>
        <Activity className={cn('h-5 w-5', healthColor)} />
        <div>
          <p className={cn('text-sm font-semibold', healthColor)}>Health Score: {healthScore}/100</p>
          <p className="text-xs text-gray-500">Based on message volume, bot activity, and subscription status</p>
        </div>
        <div className="ml-auto">
          <div className="h-2 w-32 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', healthBar)}
              style={{ width: `${healthScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* KPI Mini Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiMini label="Messages (Month)" value={kpis?.messages_this_month ?? 0} icon={MessageSquare} color="bg-[#F97316]" />
        <KpiMini label="Total Contacts"   value={kpis?.contacts_total ?? 0}      icon={Users}         color="bg-emerald-500" />
        <KpiMini label="Conversations"    value={kpis?.conversations_total ?? 0}  icon={MessageCircle} color="bg-blue-500" />
        <KpiMini label="Campaigns"        value={kpis?.campaigns_total ?? 0}      icon={Send}          color="bg-violet-500" />
        <KpiMini label="Bot Response Rate" value={`${kpis?.bot_response_rate ?? 0}%`} icon={Activity} color="bg-amber-500" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Message trend */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <h4 className="text-xs font-semibold text-gray-600 mb-3">Message Activity — Last 30 Days</h4>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={data?.message_trend ?? []}>
              <defs>
                <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#F97316" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: '#9CA3AF' }}
                axisLine={false} tickLine={false} interval={6}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }} />
              <Area type="monotone" dataKey="sent"     stroke="#F97316" fill="url(#sentGrad)" strokeWidth={2} name="Sent" />
              <Area type="monotone" dataKey="received" stroke="#2563EB" fill="none" strokeWidth={1.5} strokeDasharray="3 2" name="Received" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Campaign performance */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <h4 className="text-xs font-semibold text-gray-600 mb-3">Campaign Performance — Last 5</h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data?.campaign_stats ?? []} layout="vertical" barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }} />
              <Bar dataKey="sent"      fill="#F97316" radius={[0, 3, 3, 0]} name="Sent" />
              <Bar dataKey="delivered" fill="#16A34A" radius={[0, 3, 3, 0]} name="Delivered" />
              <Bar dataKey="replied"   fill="#2563EB" radius={[0, 3, 3, 0]} name="Replied" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Contact growth */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
        <h4 className="text-xs font-semibold text-gray-600 mb-3">Contact Growth — Last 6 Months</h4>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={data?.contact_growth ?? []}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }} />
            <Bar dataKey="count" fill="#F97316" radius={[3, 3, 0, 0]} name="Total Contacts" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

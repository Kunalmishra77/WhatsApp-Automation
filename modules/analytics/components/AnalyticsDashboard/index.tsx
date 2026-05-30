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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Conversations" value={stats?.total ?? 0} icon={MessageSquare} iconBg="bg-brand-500" loading={statsLoading} />
        <StatCard title="Open" value={stats?.open ?? 0} icon={TrendingUp} iconBg="bg-amber-500" loading={statsLoading} />
        <StatCard title="Resolved" value={stats?.resolved ?? 0} icon={CheckCircle2} iconBg="bg-emerald-500" loading={statsLoading} />
        <StatCard title="Messages Sent" value={funnel?.sent ?? 0} icon={Send} iconBg="bg-violet-500" loading={funnelLoading} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} fill="url(#colorConv)" name="Conversations" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

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
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
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

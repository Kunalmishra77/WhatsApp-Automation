import type { Metadata } from 'next';
import {
  MessageSquare, Users, TrendingUp, CheckCircle2,
  Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

interface KPICardProps {
  title:  string;
  value:  string;
  change: string;
  trend:  'up' | 'down' | 'neutral';
  icon:   React.ElementType;
  iconBg: string;
}

function KPICard({ title, value, change, trend, icon: Icon, iconBg }: KPICardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-label text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground leading-none">{value}</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBg)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {trend === 'up'   && <ArrowUpRight   className="h-3.5 w-3.5 text-emerald-500" />}
        {trend === 'down' && <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />}
        <span className={cn(
          'text-label font-medium',
          trend === 'up'      && 'text-emerald-600',
          trend === 'down'    && 'text-destructive',
          trend === 'neutral' && 'text-muted-foreground',
        )}>
          {change}
        </span>
        <span className="text-label text-muted-foreground">vs last week</span>
      </div>
    </div>
  );
}

const KPIS: KPICardProps[] = [
  { title: 'Open Conversations', value: '0', change: '—', trend: 'neutral', icon: MessageSquare, iconBg: 'bg-brand-500' },
  { title: 'Total Contacts',     value: '0', change: '—', trend: 'neutral', icon: Users,         iconBg: 'bg-violet-500' },
  { title: 'Active Leads',       value: '0', change: '—', trend: 'neutral', icon: TrendingUp,    iconBg: 'bg-amber-500'  },
  { title: 'Resolved Today',     value: '0', change: '—', trend: 'neutral', icon: CheckCircle2,  iconBg: 'bg-emerald-500'},
];

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-body-md text-muted-foreground">
          Welcome back &mdash; here&apos;s what&apos;s happening today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => <KPICard key={kpi.title} {...kpi} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Recent Activity</h2>
          </div>
          <p className="text-body-md text-muted-foreground">
            Activity feed populates as conversations come in.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Team Status</h2>
          </div>
          <p className="text-body-md text-muted-foreground">
            Online agents and queue health display here.
          </p>
        </div>
      </div>
    </div>
  );
}

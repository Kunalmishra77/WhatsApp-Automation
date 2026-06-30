'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import {
  MessageSquare, Clock, CheckCircle2, ArrowRight, RefreshCw,
  TrendingUp, UserCheck, Sparkles, Inbox,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MyWorkStats {
  conversations: {
    open: number; assigned: number; pending: number; resolved: number;
    total: number; resolvedToday: number;
  };
  leads: {
    new: number; contacted: number; follow_up: number; interested: number;
    converted: number; total: number;
  };
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

function MetricCard({
  label, value, sub, icon: Icon, iconBg, onClick,
}: {
  label: string; value: number; sub?: string; icon: React.ElementType;
  iconBg: string; onClick?: () => void;
}) {
  return (
    <motion.div
      variants={fadeUp}
      onClick={onClick}
      whileHover={onClick ? { y: -2, transition: { duration: 0.15 } } : undefined}
      className={cn(
        'group relative rounded-2xl border border-border bg-card p-5 flex flex-col gap-3',
        'shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)]',
        onClick && 'cursor-pointer hover:shadow-[0_4px_12px_0_rgb(0_0_0/0.09)] hover:border-brand-200/70',
      )}
    >
      <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm', iconBg)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-[28px] font-bold text-foreground tabular-nums leading-none tracking-tight">
          <CountUp end={value} duration={1.2} preserveValue useEasing />
        </p>
        <p className="text-xs font-medium text-muted-foreground mt-1.5">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
      {onClick && (
        <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
      )}
    </motion.div>
  );
}

export function MyWorkDashboard() {
  const router      = useRouter();
  const workspace   = useWorkspaceStore((s) => s.activeWorkspace);
  const user        = useAuthStore((s) => s.user);
  const workspaceId = workspace?.id ?? '';

  const [stats, setStats]     = useState<MyWorkStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/dashboard-stats/my-work?workspaceId=${workspaceId}`);
      const data = await res.json() as MyWorkStats;
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name     = user?.full_name?.split(' ')[0] ?? 'there';
  const dateStr  = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <div className="max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6 space-y-8">

        {/* ── Hero banner ─────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-navy-800 to-brand-700 px-6 sm:px-8 py-6 sm:py-8 text-white shadow-xl shadow-navy-900/30">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-brand-200 mb-1">{dateStr}</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting}, {name} 👋</h1>
              <p className="text-brand-200 text-sm mt-1.5 flex items-center gap-1.5">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
                Your assigned work today
              </p>
            </div>
            <Button
              variant="outline" size="sm" onClick={() => void load()}
              className="gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30 hover:text-white"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>

        {!stats && loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl border border-border bg-card shimmer" />
            ))}
          </div>
        )}

        {stats && (
          <>
            <motion.section variants={stagger} initial="hidden" animate="show">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-7 w-7 rounded-lg bg-brand-100 flex items-center justify-center">
                  <MessageSquare className="h-3.5 w-3.5 text-brand-600" />
                </div>
                <span className="text-sm font-bold text-foreground">My Conversations</span>
              </div>
              <motion.div variants={stagger} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Open" value={stats.conversations.open} icon={Inbox}
                  iconBg="bg-gradient-to-br from-brand-500 to-brand-600"
                  onClick={() => router.push('/conversations')} />
                <MetricCard label="Pending" value={stats.conversations.pending} icon={Clock}
                  iconBg="bg-gradient-to-br from-amber-500 to-orange-600"
                  onClick={() => router.push('/conversations')} />
                <MetricCard label="Resolved Today" value={stats.conversations.resolvedToday} icon={CheckCircle2}
                  iconBg="bg-gradient-to-br from-emerald-500 to-teal-600" />
                <MetricCard label="Total Assigned" value={stats.conversations.total} icon={UserCheck}
                  iconBg="bg-gradient-to-br from-teal-500 to-cyan-600"
                  onClick={() => router.push('/conversations')} />
              </motion.div>
            </motion.section>

            <motion.section variants={stagger} initial="hidden" animate="show">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <span className="text-sm font-bold text-foreground">My Leads</span>
              </div>
              <motion.div variants={stagger} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="New" value={stats.leads.new} icon={Sparkles}
                  iconBg="bg-gradient-to-br from-sky-500 to-blue-600"
                  onClick={() => router.push('/crm')} />
                <MetricCard label="Follow Up" value={stats.leads.follow_up} icon={TrendingUp}
                  iconBg="bg-gradient-to-br from-amber-500 to-orange-600"
                  onClick={() => router.push('/crm')} />
                <MetricCard label="Interested" value={stats.leads.interested} icon={TrendingUp}
                  iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
                  onClick={() => router.push('/crm')} />
                <MetricCard label="Converted" value={stats.leads.converted} icon={CheckCircle2}
                  iconBg="bg-gradient-to-br from-emerald-500 to-green-600"
                  onClick={() => router.push('/crm')} />
              </motion.div>
            </motion.section>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.35 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <button
                onClick={() => router.push('/conversations')}
                className="rounded-2xl border border-border bg-card p-5 text-left hover:border-brand-200 hover:shadow-md transition-all flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-foreground">My Conversations</p>
                  <p className="text-xs text-muted-foreground mt-0.5">View and respond to chats assigned to you</p>
                </div>
                <ArrowRight className="h-4 w-4 text-brand-500" />
              </button>
              <button
                onClick={() => router.push('/crm')}
                className="rounded-2xl border border-border bg-card p-5 text-left hover:border-brand-200 hover:shadow-md transition-all flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-foreground">My Leads</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Track leads assigned to you through the pipeline</p>
                </div>
                <ArrowRight className="h-4 w-4 text-brand-500" />
              </button>
            </motion.div>
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import {
  MessageSquare, Users, Bot, CalendarCheck, TrendingUp,
  Clock, RefreshCw, ArrowRight, CheckCircle2, ArrowUpRight,
  ArrowDownRight, Minus, UserCheck, Megaphone, Tag, AlertCircle,
  BarChart3, Inbox, Send, UserX, Phone, Activity, Zap, Sparkles,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

interface DashboardStats {
  conversations: {
    open: number; today: number; yesterday: number; total: number;
    resolved: number; pending: number; botActive: number; delta: number;
  };
  messages: {
    today: number; yesterday: number; thisWeek: number; botToday: number;
    inbound: number; outbound: number; botRate: number; delta: number;
  };
  contacts: { total: number; newMonth: number; newWeek: number; optedOut: number };
  events: {
    demoBooked: number; callbackRequested: number; appointmentSet: number;
    notInterested: number; followUp: number; pendingActions: number;
  };
  upcomingEvents: Array<{
    id: string; event_type: string; contact_name: string; contact_phone: string;
    scheduled_at: string | null; location: string | null; status: string; created_at: string;
  }>;
  recentConversations: Array<{
    id: string; last_message: string; last_message_at: string;
    status: string; bot_paused: boolean;
    contact: { name: string; phone: string } | null;
  }>;
  topLabels: Array<{ name: string; color: string; count: number }>;
  recentCampaigns: Array<{ id: string; name: string; status: string; sent_count: number; created_at: string }>;
}

const EVENT_BADGE: Record<string, { label: string; cls: string }> = {
  demo_booked:        { label: 'Demo',      cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  callback_requested: { label: 'Callback',  cls: 'bg-sky-100 text-sky-700 border-sky-200'             },
  appointment_set:    { label: 'Appt',      cls: 'bg-violet-100 text-violet-700 border-violet-200'    },
  follow_up:          { label: 'Follow Up', cls: 'bg-amber-100 text-amber-700 border-amber-200'       },
  not_interested:     { label: 'Cold',      cls: 'bg-red-100 text-red-700 border-red-200'             },
};

function Delta({ v }: { v: number }) {
  const base = 'inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-1.5 py-0.5';
  if (v === 0) return (
    <span className={cn(base, 'bg-slate-100 text-slate-500')}>
      <Minus className="h-2.5 w-2.5" /> No change
    </span>
  );
  if (v > 0) return (
    <span className={cn(base, 'bg-emerald-50 text-emerald-700')}>
      <ArrowUpRight className="h-2.5 w-2.5" /> +{v} today
    </span>
  );
  return (
    <span className={cn(base, 'bg-red-50 text-red-600')}>
      <ArrowDownRight className="h-2.5 w-2.5" /> {v} today
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── Metric Card ────────────────────────────────────────────────────────────── */
function MetricCard({
  label, value, sub, icon: Icon, iconBg, delta, onClick, badge,
}: {
  label: string; value: number | string; sub?: string; icon: React.ElementType;
  iconBg: string; delta?: number; onClick?: () => void; badge?: string;
}) {
  const isNum = typeof value === 'number';
  return (
    <motion.div
      variants={fadeUp}
      onClick={onClick}
      whileHover={onClick ? { y: -2, transition: { duration: 0.15 } } : undefined}
      className={cn(
        'group relative rounded-2xl border border-border bg-card p-5 flex flex-col gap-3',
        'shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)]',
        'transition-shadow duration-200',
        onClick && 'cursor-pointer hover:shadow-[0_4px_12px_0_rgb(0_0_0/0.09),0_2px_4px_-2px_rgb(0_0_0/0.06)] hover:border-brand-200/70',
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn(
          'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
          'shadow-sm',
          iconBg,
        )}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        {badge && (
          <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-violet-100 border border-violet-200 text-violet-700 flex items-center gap-0.5">
            <Sparkles className="h-2.5 w-2.5" />{badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-[28px] font-bold text-foreground tabular-nums leading-none tracking-tight">
          {isNum
            ? <CountUp end={value as number} duration={1.4} separator="," preserveValue useEasing />
            : value}
        </p>
        <p className="text-xs font-medium text-muted-foreground mt-1.5">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
      {delta !== undefined && <Delta v={delta} />}
      {onClick && (
        <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
      )}
    </motion.div>
  );
}

/* ── Section Header ─────────────────────────────────────────────────────────── */
function SectionHeader({
  icon: Icon, label, iconColor, action, onAction,
}: {
  icon: React.ElementType; label: string; iconColor: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center', iconColor)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-bold text-foreground">{label}</span>
      </div>
      {action && onAction && (
        <button
          onClick={onAction}
          className="flex items-center gap-1 text-xs font-semibold text-brand-500 hover:text-brand-600 transition-colors"
        >
          {action} <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ── Panel Card ─────────────────────────────────────────────────────────────── */
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'rounded-2xl border border-border bg-card',
      'shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)]',
      className,
    )}>
      {children}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router      = useRouter();
  const workspace   = useWorkspaceStore((s) => s.activeWorkspace);
  const user        = useAuthStore((s) => s.user);
  const workspaceId = workspace?.id ?? '';

  const [stats,   setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/dashboard-stats?workspaceId=${workspaceId}`);
      const data = await res.json() as DashboardStats;
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
          {/* Decorative orb */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
          <div className="pointer-events-none absolute right-32 bottom-0 h-48 w-48 rounded-full bg-brand-400/20 blur-2xl" />

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-brand-200 mb-1">{dateStr}</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {greeting}, {name} 👋
              </h1>
              <p className="text-brand-200 text-sm mt-1.5 flex items-center gap-1.5">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
                {workspace?.name} · Live overview
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {(stats?.events.pendingActions ?? 0) > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-bold bg-amber-400/20 border border-amber-400/30 text-amber-200 px-3 py-1.5 rounded-full">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {stats!.events.pendingActions} pending
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load()}
                className="gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30 hover:text-white"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          </div>

          {/* KPI strip */}
          {stats && (
            <div className="relative mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Open Conversations', value: stats.conversations.open,  accent: 'border-brand-400/50' },
                { label: 'Messages Today',      value: stats.messages.today,      accent: 'border-emerald-400/40' },
                { label: 'Total Contacts',       value: stats.contacts.total.toLocaleString(), accent: 'border-amber-400/40' },
                { label: 'Bot Reply Rate',        value: `${stats.messages.botRate}%`, accent: 'border-violet-400/40' },
              ].map((s) => (
                <div key={s.label} className={cn(
                  'rounded-xl bg-white/[0.08] border backdrop-blur-sm px-4 py-3',
                  s.accent,
                )}>
                  <p className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight">{s.value}</p>
                  <p className="text-xs text-brand-200 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Loading skeleton ─────────────────────────────────────────────── */}
        {!stats && loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl border border-border bg-card shimmer" />
            ))}
          </div>
        )}

        {stats && (
          <>
            {/* ── Conversations ─────────────────────────────────────────────── */}
            <motion.section variants={stagger} initial="hidden" animate="show">
              <SectionHeader icon={MessageSquare} label="Conversations" iconColor="bg-brand-100 text-brand-600"
                action="View all" onAction={() => router.push('/conversations')} />
              <motion.div variants={stagger} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Open Now" value={stats.conversations.open} icon={MessageSquare}
                  iconBg="bg-gradient-to-br from-brand-500 to-brand-600"
                  sub={`${stats.conversations.today} opened today`}
                  delta={stats.conversations.delta} onClick={() => router.push('/conversations')} />
                <MetricCard label="Bot-Handled" value={stats.conversations.botActive} icon={Bot}
                  iconBg="bg-gradient-to-br from-emerald-500 to-teal-600"
                  sub="Auto-reply active" badge="AI"
                  onClick={() => router.push('/conversations')} />
                <MetricCard label="Pending Review" value={stats.conversations.pending} icon={Clock}
                  iconBg="bg-gradient-to-br from-amber-500 to-orange-600"
                  sub="Waiting for agent"
                  onClick={() => router.push('/conversations')} />
                <MetricCard label="Resolved" value={stats.conversations.resolved} icon={CheckCircle2}
                  iconBg="bg-gradient-to-br from-teal-500 to-cyan-600"
                  sub={`${stats.conversations.total.toLocaleString()} all time`} />
              </motion.div>
            </motion.section>

            {/* ── Message Activity ──────────────────────────────────────────── */}
            <motion.section variants={stagger} initial="hidden" animate="show">
              <SectionHeader icon={Activity} label="Message Activity" iconColor="bg-violet-100 text-violet-600" />
              <motion.div variants={stagger} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Messages Today" value={stats.messages.today} icon={TrendingUp}
                  iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
                  sub={`${stats.messages.thisWeek.toLocaleString()} this week`}
                  delta={stats.messages.delta} />
                <MetricCard label="Inbound" value={stats.messages.inbound} icon={Inbox}
                  iconBg="bg-gradient-to-br from-sky-500 to-blue-600"
                  sub="From customers today" />
                <MetricCard label="Outbound" value={stats.messages.outbound} icon={Send}
                  iconBg="bg-gradient-to-br from-indigo-500 to-blue-700"
                  sub={`${stats.messages.botToday} automated by bot`} />
                <MetricCard label="Bot Replies" value={stats.messages.botToday} icon={Zap}
                  iconBg="bg-gradient-to-br from-emerald-500 to-green-600"
                  sub={`${stats.messages.botRate}% of all outbound`} badge="AI" />
              </motion.div>
            </motion.section>

            {/* ── Contacts ──────────────────────────────────────────────────── */}
            <motion.section variants={stagger} initial="hidden" animate="show">
              <SectionHeader icon={Users} label="Contacts" iconColor="bg-orange-100 text-orange-600"
                action="View all" onAction={() => router.push('/contacts')} />
              <motion.div variants={stagger} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Total Contacts" value={stats.contacts.total.toLocaleString()} icon={Users}
                  iconBg="bg-gradient-to-br from-orange-500 to-amber-600"
                  sub={`+${stats.contacts.newMonth} this month`}
                  onClick={() => router.push('/contacts')} />
                <MetricCard label="New This Week" value={stats.contacts.newWeek} icon={UserCheck}
                  iconBg="bg-gradient-to-br from-cyan-500 to-sky-600"
                  sub="Last 7 days"
                  onClick={() => router.push('/contacts')} />
                <MetricCard label="New This Month" value={stats.contacts.newMonth} icon={TrendingUp}
                  iconBg="bg-gradient-to-br from-pink-500 to-rose-600"
                  sub="Last 30 days"
                  onClick={() => router.push('/contacts')} />
                <MetricCard label="Opted Out" value={stats.contacts.optedOut} icon={UserX}
                  iconBg="bg-gradient-to-br from-rose-500 to-red-600"
                  sub="Unsubscribed" />
              </motion.div>
            </motion.section>

            {/* ── Bookings & Events ─────────────────────────────────────────── */}
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.35 }}>
              <SectionHeader icon={CalendarCheck} label="Bookings & Events — last 30 days"
                iconColor="bg-emerald-100 text-emerald-600"
                action="Manage" onAction={() => router.push('/bookings')} />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Demos Booked',   value: stats.events.demoBooked,        iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
                  { label: 'Callbacks',       value: stats.events.callbackRequested, iconBg: 'bg-gradient-to-br from-sky-500 to-blue-600'     },
                  { label: 'Appointments',    value: stats.events.appointmentSet,    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600' },
                  { label: 'Follow Ups',      value: stats.events.followUp,          iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600'  },
                  { label: 'Not Interested',  value: stats.events.notInterested,     iconBg: 'bg-gradient-to-br from-rose-500 to-red-600'     },
                ].map((s, i) => (
                  <motion.button
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                    key={s.label}
                    onClick={() => router.push('/bookings')}
                    className={cn(
                      'group rounded-2xl border border-border bg-card p-4 text-left',
                      'shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)]',
                      'hover:-translate-y-0.5 hover:shadow-[0_4px_12px_0_rgb(0_0_0/0.09)] hover:border-brand-200/70 transition-all duration-200',
                    )}
                  >
                    <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center mb-3 shadow-sm', s.iconBg)}>
                      <CalendarCheck className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-[28px] font-bold tabular-nums leading-none tracking-tight text-foreground">
                      <CountUp end={s.value} duration={1.2} preserveValue useEasing />
                    </p>
                    <p className="text-xs font-medium text-muted-foreground mt-1.5">{s.label}</p>
                  </motion.button>
                ))}
              </div>
            </motion.section>

            {/* ── Three-panel row ───────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-4"
            >

              {/* Pending Actions */}
              <Panel>
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <span className="text-sm font-bold text-foreground">Pending Actions</span>
                  </div>
                  {stats.events.pendingActions > 0 && (
                    <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                      {stats.events.pendingActions}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  {stats.upcomingEvents.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center gap-2">
                      <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">All clear</p>
                      <p className="text-xs text-muted-foreground">No pending actions right now</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {stats.upcomingEvents.slice(0, 5).map((ev) => {
                        const badge = EVENT_BADGE[ev.event_type];
                        return (
                          <div key={ev.id} className="flex items-start gap-2.5 rounded-xl border border-border/60 p-2.5 bg-background/50 hover:border-border hover:bg-background transition-all">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold border shrink-0 mt-0.5', badge?.cls ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                              {badge?.label ?? ev.event_type}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground truncate">{ev.contact_name}</p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Phone className="h-2.5 w-2.5 shrink-0" />{ev.contact_phone}
                              </p>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{timeAgo(ev.created_at)}</span>
                          </div>
                        );
                      })}
                      <button
                        onClick={() => router.push('/bookings')}
                        className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-500 hover:text-brand-600 py-2 rounded-xl hover:bg-brand-50 transition-colors"
                      >
                        View all bookings <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </Panel>

              {/* Recent Conversations */}
              <Panel>
                <div className="p-4 border-b border-border flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-brand-100 flex items-center justify-center">
                    <MessageSquare className="h-3.5 w-3.5 text-brand-600" />
                  </div>
                  <span className="text-sm font-bold text-foreground">Recent Conversations</span>
                </div>
                <div className="p-3 space-y-1.5">
                  {stats.recentConversations.slice(0, 5).map((conv) => {
                    const displayName = conv.contact?.name ?? conv.contact?.phone ?? 'Unknown';
                    const initials = displayName[0]?.toUpperCase() ?? '?';
                    return (
                      <button
                        key={conv.id}
                        onClick={() => router.push(`/conversations/${conv.id}`)}
                        className="w-full flex items-center gap-2.5 rounded-xl border border-border/60 p-2.5 bg-background/50 text-left hover:border-brand-200 hover:bg-brand-50/30 transition-all"
                      >
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-indigo-600 flex items-center justify-center shrink-0 text-xs font-bold text-white shadow-sm">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-xs font-semibold text-foreground truncate flex-1">{displayName}</p>
                            {!conv.bot_paused && (
                              <span className="shrink-0 text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 rounded-full">Bot</span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{conv.last_message}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {conv.last_message_at ? timeAgo(conv.last_message_at) : ''}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => router.push('/conversations')}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-500 hover:text-brand-600 py-2 rounded-xl hover:bg-brand-50 transition-colors"
                  >
                    All conversations <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </Panel>

              {/* Right column: Labels + Campaigns + Performance */}
              <div className="space-y-3">

                {/* Top Labels */}
                <Panel className="p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center">
                      <Tag className="h-3.5 w-3.5 text-violet-600" />
                    </div>
                    <span className="text-sm font-bold text-foreground">Top Labels</span>
                  </div>
                  {stats.topLabels.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No labels assigned yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {stats.topLabels.map((l) => (
                        <span key={l.name}
                          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-semibold"
                          style={{ backgroundColor: `${l.color}14`, borderColor: `${l.color}30`, color: l.color }}>
                          {l.name}
                          <span className="opacity-70 font-bold">{l.count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </Panel>

                {/* Recent Campaigns */}
                <Panel className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Megaphone className="h-3.5 w-3.5 text-orange-600" />
                      </div>
                      <span className="text-sm font-bold text-foreground">Recent Campaigns</span>
                    </div>
                    <button
                      onClick={() => router.push('/campaigns')}
                      className="flex items-center gap-0.5 text-[11px] font-semibold text-brand-500 hover:text-brand-600 transition-colors"
                    >
                      All <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  {stats.recentCampaigns.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No campaigns yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {stats.recentCampaigns.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-bold text-foreground tabular-nums">{(c.sent_count ?? 0).toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">sent</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                {/* Performance bars */}
                <Panel className="p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="h-7 w-7 rounded-lg bg-brand-100 flex items-center justify-center">
                      <BarChart3 className="h-3.5 w-3.5 text-brand-600" />
                    </div>
                    <span className="text-sm font-bold text-foreground">Performance</span>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'Bot Reply Rate',      value: `${stats.messages.botRate}%`,              color: 'bg-emerald-500', pct: stats.messages.botRate },
                      { label: 'Weekly Messages',     value: stats.messages.thisWeek.toLocaleString(),  color: 'bg-violet-500',  pct: Math.min(100, Math.round(stats.messages.thisWeek / 10)) },
                      { label: 'Contact Growth/wk',   value: `+${stats.contacts.newWeek}`,              color: 'bg-sky-500',     pct: Math.min(100, stats.contacts.newWeek * 5) },
                      {
                        label: 'Resolution Rate',
                        value: stats.conversations.total > 0
                          ? `${Math.round((stats.conversations.resolved / stats.conversations.total) * 100)}%`
                          : '—',
                        color: 'bg-teal-500',
                        pct: stats.conversations.total > 0
                          ? Math.round((stats.conversations.resolved / stats.conversations.total) * 100)
                          : 0,
                      },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
                          <span className="text-[11px] font-bold text-foreground tabular-nums">{s.value}</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all duration-700', s.color)} style={{ width: `${Math.min(s.pct, 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

              </div>
            </motion.div>
          </>
        )}

        {/* Bottom padding */}
        <div className="h-4" />
      </div>
    </div>
  );
}

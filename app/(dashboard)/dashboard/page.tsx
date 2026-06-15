'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Users, Bot, CalendarCheck, TrendingUp,
  Clock, RefreshCw, ArrowRight, CheckCircle2, ArrowUpRight,
  ArrowDownRight, Minus, UserCheck, Megaphone, Tag, AlertCircle,
  BarChart3, Inbox, Send, UserX, Phone, Activity, Zap,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  demo_booked:        { label: 'Demo',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  callback_requested: { label: 'Callback', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  appointment_set:    { label: 'Appt',     cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  follow_up:          { label: 'Follow Up',cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  not_interested:     { label: 'Cold',     cls: 'bg-red-100 text-red-700 border-red-200' },
};

function Delta({ v }: { v: number }) {
  const base = 'flex items-center gap-0.5 text-[11px] font-medium';
  if (v === 0) return <span className={cn(base, 'text-muted-foreground')}><Minus className="h-3 w-3" /> Same as yesterday</span>;
  if (v > 0)   return <span className={cn(base, 'text-emerald-600')}><ArrowUpRight className="h-3 w-3" /> +{v} vs yesterday</span>;
  return <span className={cn(base, 'text-red-500')}><ArrowDownRight className="h-3 w-3" /> {v} vs yesterday</span>;
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

/* ─── Metric Card ─────────────────────────────────────────────────────────── */
function MetricCard({
  label, value, sub, icon: Icon, iconBg, delta, onClick, badge,
}: {
  label: string; value: number | string; sub?: string; icon: React.ElementType;
  iconBg: string; delta?: number; onClick?: () => void; badge?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-2xl border border-border bg-card p-5 flex flex-col gap-3',
        'shadow-sm transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md hover:border-brand-300',
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        {badge && (
          <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-600">
            {badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
      {delta !== undefined && <Delta v={delta} />}
      {onClick && (
        <ArrowRight className="absolute right-4 bottom-4 h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-brand-400 transition-colors" />
      )}
    </div>
  );
}

/* ─── Section Label ───────────────────────────────────────────────────────── */
function SectionLabel({ icon: Icon, label, action, onAction }: {
  icon: React.ElementType; label: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      {action && onAction && (
        <button onClick={onAction} className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-medium transition-colors">
          {action} <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ─── Card Shell ──────────────────────────────────────────────────────────── */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card shadow-sm', className)}>
      {children}
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */
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
  const dateStr  = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <div className="max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6 space-y-8">

        {/* ── Header banner ─────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-brand-500 to-sky-400 p-6 sm:p-8 text-white shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-brand-100 mb-1">{dateStr}</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting}, {name}</h1>
              <p className="text-brand-100 text-sm mt-1">{workspace?.name} · Live performance overview</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {stats?.events.pendingActions ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold bg-white/20 border border-white/30 backdrop-blur-sm px-3 py-1.5 rounded-full">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {stats.events.pendingActions} pending action{stats.events.pendingActions > 1 ? 's' : ''}
                </span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load()}
                className="gap-1.5 bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                {loading ? 'Refreshing' : 'Refresh'}
              </Button>
            </div>
          </div>

          {/* Top-line numbers inside banner */}
          {stats && (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Open Conversations', value: stats.conversations.open },
                { label: 'Messages Today',      value: stats.messages.today },
                { label: 'Total Contacts',       value: stats.contacts.total },
                { label: 'Bot Reply Rate',        value: `${stats.messages.botRate}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-white/10 border border-white/20 px-4 py-3 backdrop-blur-sm">
                  <p className="text-xl sm:text-2xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-xs text-brand-100 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Loading skeleton ──────────────────────────────────────────── */}
        {!stats && loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}

        {stats && (
          <>
            {/* ── Conversations ─────────────────────────────────────────── */}
            <section>
              <SectionLabel icon={MessageSquare} label="Conversations" action="View all" onAction={() => router.push('/conversations')} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Open" value={stats.conversations.open} icon={MessageSquare}
                  iconBg="bg-brand-500" sub={`${stats.conversations.today} opened today`}
                  delta={stats.conversations.delta} onClick={() => router.push('/conversations')} />
                <MetricCard label="Bot-Handled" value={stats.conversations.botActive} icon={Bot}
                  iconBg="bg-emerald-500" sub="Auto-reply active" badge="AI"
                  onClick={() => router.push('/conversations')} />
                <MetricCard label="Pending Review" value={stats.conversations.pending} icon={Clock}
                  iconBg="bg-amber-500" sub="Waiting for agent"
                  onClick={() => router.push('/conversations')} />
                <MetricCard label="Resolved" value={stats.conversations.resolved} icon={CheckCircle2}
                  iconBg="bg-teal-500" sub={`${stats.conversations.total.toLocaleString()} all time`} />
              </div>
            </section>

            {/* ── Messages ──────────────────────────────────────────────── */}
            <section>
              <SectionLabel icon={Activity} label="Message Activity" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Messages Today" value={stats.messages.today} icon={TrendingUp}
                  iconBg="bg-violet-500" sub={`${stats.messages.thisWeek.toLocaleString()} this week`}
                  delta={stats.messages.delta} />
                <MetricCard label="Inbound" value={stats.messages.inbound} icon={Inbox}
                  iconBg="bg-sky-500" sub="From customers today" />
                <MetricCard label="Outbound" value={stats.messages.outbound} icon={Send}
                  iconBg="bg-indigo-500" sub={`${stats.messages.botToday} automated by bot`} />
                <MetricCard label="Bot Replies" value={stats.messages.botToday} icon={Zap}
                  iconBg="bg-emerald-500" sub={`${stats.messages.botRate}% of all outbound`} badge="AI" />
              </div>
            </section>

            {/* ── Contacts ──────────────────────────────────────────────── */}
            <section>
              <SectionLabel icon={Users} label="Contacts" action="View all" onAction={() => router.push('/contacts')} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Total Contacts" value={stats.contacts.total.toLocaleString()} icon={Users}
                  iconBg="bg-orange-500" sub={`+${stats.contacts.newMonth} this month`}
                  onClick={() => router.push('/contacts')} />
                <MetricCard label="New This Week" value={stats.contacts.newWeek} icon={UserCheck}
                  iconBg="bg-cyan-500" sub="Last 7 days"
                  onClick={() => router.push('/contacts')} />
                <MetricCard label="New This Month" value={stats.contacts.newMonth} icon={TrendingUp}
                  iconBg="bg-pink-500" sub="Last 30 days"
                  onClick={() => router.push('/contacts')} />
                <MetricCard label="Opted Out" value={stats.contacts.optedOut} icon={UserX}
                  iconBg="bg-rose-500" sub="Unsubscribed" />
              </div>
            </section>

            {/* ── Bookings & Events ─────────────────────────────────────── */}
            <section>
              <SectionLabel icon={CalendarCheck} label="Bookings & Events — last 30 days"
                action="Manage" onAction={() => router.push('/bookings')} />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Demos Booked',   value: stats.events.demoBooked,        iconBg: 'bg-emerald-500' },
                  { label: 'Callbacks',       value: stats.events.callbackRequested, iconBg: 'bg-sky-500'     },
                  { label: 'Appointments',    value: stats.events.appointmentSet,    iconBg: 'bg-violet-500'  },
                  { label: 'Follow Ups',      value: stats.events.followUp,          iconBg: 'bg-amber-500'   },
                  { label: 'Not Interested',  value: stats.events.notInterested,     iconBg: 'bg-rose-500'    },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={() => router.push('/bookings')}
                    className="group rounded-2xl border border-border bg-card shadow-sm p-4 text-left hover:shadow-md hover:border-brand-300 transition-all duration-200"
                  >
                    <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center mb-3', s.iconBg)}>
                      <CalendarCheck className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* ── Three-panel row ───────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Pending Actions */}
              <Card>
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Pending Actions</span>
                  </div>
                  {stats.events.pendingActions > 0 && (
                    <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {stats.events.pendingActions}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  {stats.upcomingEvents.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium text-foreground">All clear</p>
                      <p className="text-xs text-muted-foreground mt-1">No pending actions at this time</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {stats.upcomingEvents.slice(0, 5).map((ev) => {
                        const badge = EVENT_BADGE[ev.event_type];
                        return (
                          <div key={ev.id} className="flex items-start gap-2.5 rounded-xl border border-border p-2.5 bg-background/50">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold border shrink-0 mt-0.5', badge?.cls ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
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
                      <button onClick={() => router.push('/bookings')} className="w-full mt-2 flex items-center justify-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 py-1.5 rounded-lg hover:bg-brand-50 transition-colors">
                        View all bookings <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </Card>

              {/* Recent Conversations */}
              <Card>
                <div className="p-4 border-b border-border flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-brand-100 flex items-center justify-center">
                    <MessageSquare className="h-3.5 w-3.5 text-brand-600" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Recent Conversations</span>
                </div>
                <div className="p-3 space-y-1.5">
                  {stats.recentConversations.slice(0, 5).map((conv) => {
                    const initials = (conv.contact?.name ?? conv.contact?.phone ?? '?')[0]?.toUpperCase() ?? '?';
                    const displayName = conv.contact?.name ?? conv.contact?.phone ?? 'Unknown';
                    return (
                      <button
                        key={conv.id}
                        onClick={() => router.push(`/conversations/${conv.id}`)}
                        className="w-full flex items-center gap-2.5 rounded-xl border border-border p-2.5 bg-background/50 text-left hover:border-brand-300 hover:bg-brand-50/30 transition-all"
                      >
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shrink-0 text-xs font-bold text-white">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-xs font-semibold text-foreground truncate flex-1">{displayName}</p>
                            {!conv.bot_paused && (
                              <span className="shrink-0 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 rounded-full">Bot</span>
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
                  <button onClick={() => router.push('/conversations')} className="w-full mt-2 flex items-center justify-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 py-1.5 rounded-lg hover:bg-brand-50 transition-colors">
                    All conversations <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </Card>

              {/* Right column */}
              <div className="space-y-4">

                {/* Top Labels */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center">
                      <Tag className="h-3.5 w-3.5 text-violet-600" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Top Labels</span>
                  </div>
                  {stats.topLabels.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No labels have been assigned yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {stats.topLabels.map((l) => (
                        <span key={l.name}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium"
                          style={{ backgroundColor: `${l.color}15`, borderColor: `${l.color}35`, color: l.color }}>
                          {l.name}
                          <span className="font-bold opacity-70">{l.count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Recent Campaigns */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Megaphone className="h-3.5 w-3.5 text-orange-600" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">Recent Campaigns</span>
                    </div>
                    <button onClick={() => router.push('/campaigns')} className="text-[11px] text-brand-500 hover:text-brand-600 font-medium flex items-center gap-0.5">
                      All <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  {stats.recentCampaigns.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No campaigns have been created yet.</p>
                  ) : (
                    <div className="space-y-2">
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
                </Card>

                {/* Performance summary */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-lg bg-brand-100 flex items-center justify-center">
                      <BarChart3 className="h-3.5 w-3.5 text-brand-600" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Performance Summary</span>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Bot Reply Rate',      value: `${stats.messages.botRate}%`,                color: 'bg-emerald-500', pct: stats.messages.botRate },
                      { label: 'Weekly Messages',     value: stats.messages.thisWeek.toLocaleString(),   color: 'bg-violet-500',  pct: Math.min(100, Math.round(stats.messages.thisWeek / 10)) },
                      { label: 'Contact Growth/Week', value: `+${stats.contacts.newWeek}`,               color: 'bg-sky-500',     pct: Math.min(100, stats.contacts.newWeek * 5) },
                      { label: 'Resolution Rate',     value: stats.conversations.total > 0 ? `${Math.round((stats.conversations.resolved / stats.conversations.total) * 100)}%` : '—', color: 'bg-teal-500', pct: stats.conversations.total > 0 ? Math.round((stats.conversations.resolved / stats.conversations.total) * 100) : 0 },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-muted-foreground">{s.label}</span>
                          <span className="text-[11px] font-bold text-foreground tabular-nums">{s.value}</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', s.color)} style={{ width: `${Math.min(s.pct, 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

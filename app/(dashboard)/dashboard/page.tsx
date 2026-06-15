'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Users, Bot, CalendarCheck, Phone, TrendingUp,
  Clock, RefreshCw, ArrowRight, CheckCircle2, ArrowUpRight,
  ArrowDownRight, Minus, UserCheck, Megaphone, Tag, AlertCircle,
  BarChart3, Inbox, Send, UserX,
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

const EVENT_LABELS: Record<string, string> = {
  demo_booked: 'Demo', callback_requested: 'Callback', appointment_set: 'Appt',
};
const EVENT_COLORS: Record<string, string> = {
  demo_booked: 'bg-green-100 text-green-700 border-green-200',
  callback_requested: 'bg-blue-100 text-blue-700 border-blue-200',
  appointment_set: 'bg-purple-100 text-purple-700 border-purple-200',
};

function Delta({ v }: { v: number }) {
  if (v === 0) return <span className="flex items-center gap-0.5 text-muted-foreground"><Minus className="h-3 w-3" /> same as yesterday</span>;
  if (v > 0)  return <span className="flex items-center gap-0.5 text-green-600"><ArrowUpRight className="h-3 w-3" /> +{v} vs yesterday</span>;
  return <span className="flex items-center gap-0.5 text-red-500"><ArrowDownRight className="h-3 w-3" /> {v} vs yesterday</span>;
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

function StatCard({
  label, value, sub, icon: Icon, color, bg, border, onClick,
  badge, delta,
}: {
  label: string; value: number | string; sub?: string; icon: React.ElementType;
  color: string; bg: string; border: string; onClick?: () => void;
  badge?: string; delta?: number;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 space-y-1 transition-shadow',
        bg, border,
        onClick && 'cursor-pointer hover:shadow-md',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          {badge && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/60 border text-muted-foreground">{badge}</span>}
          <Icon className={cn('h-4 w-4', color)} />
        </div>
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      {delta !== undefined && <div className="text-[10px]"><Delta v={delta} /></div>}
    </div>
  );
}

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

  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.full_name?.split(' ')[0] ?? 'there';
  const dateStr   = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">{greeting}, {firstName}! 👋</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{dateStr} · {workspace?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {stats?.events.pendingActions ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
                <AlertCircle className="h-3.5 w-3.5" />
                {stats.events.pendingActions} pending action{stats.events.pendingActions > 1 ? 's' : ''}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>

        {!stats && loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <>
            {/* ── Row 1: Conversation metrics ─────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Conversations</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Open" value={stats.conversations.open} icon={MessageSquare}
                  color="text-brand-600" bg="bg-brand-50" border="border-brand-200"
                  sub={`${stats.conversations.today} new today`} delta={stats.conversations.delta}
                  onClick={() => router.push('/conversations')} />
                <StatCard label="Bot Active" value={stats.conversations.botActive} icon={Bot}
                  color="text-green-600" bg="bg-green-50" border="border-green-200"
                  sub={`${stats.messages.botRate}% auto-reply rate`}
                  badge="AI" onClick={() => router.push('/conversations')} />
                <StatCard label="Pending Review" value={stats.conversations.pending} icon={Clock}
                  color="text-amber-600" bg="bg-amber-50" border="border-amber-200"
                  sub="Waiting for agent" onClick={() => router.push('/conversations')} />
                <StatCard label="Resolved Total" value={stats.conversations.resolved} icon={CheckCircle2}
                  color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-200"
                  sub={`${stats.conversations.total} total all time`} />
              </div>
            </section>

            {/* ── Row 2: Message metrics ───────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Messages</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Messages Today" value={stats.messages.today} icon={TrendingUp}
                  color="text-purple-600" bg="bg-purple-50" border="border-purple-200"
                  sub={`${stats.messages.thisWeek} this week`} delta={stats.messages.delta} />
                <StatCard label="Inbound Today" value={stats.messages.inbound} icon={Inbox}
                  color="text-sky-600" bg="bg-sky-50" border="border-sky-200"
                  sub="From customers" />
                <StatCard label="Outbound Today" value={stats.messages.outbound} icon={Send}
                  color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-200"
                  sub={`${stats.messages.botToday} by bot`} />
                <StatCard label="Bot Replies Today" value={stats.messages.botToday} icon={Bot}
                  color="text-green-600" bg="bg-green-50" border="border-green-200"
                  sub={`${stats.messages.botRate}% of all outbound`} badge="AI" />
              </div>
            </section>

            {/* ── Row 3: Contacts ──────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contacts</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total Contacts" value={stats.contacts.total} icon={Users}
                  color="text-amber-600" bg="bg-amber-50" border="border-amber-200"
                  sub={`+${stats.contacts.newMonth} this month`}
                  onClick={() => router.push('/contacts')} />
                <StatCard label="New This Week" value={stats.contacts.newWeek} icon={UserCheck}
                  color="text-teal-600" bg="bg-teal-50" border="border-teal-200"
                  sub="Last 7 days" onClick={() => router.push('/contacts')} />
                <StatCard label="Opted Out" value={stats.contacts.optedOut} icon={UserX}
                  color="text-red-500" bg="bg-red-50" border="border-red-200"
                  sub="Unsubscribed from messages" />
                <StatCard label="New This Month" value={stats.contacts.newMonth} icon={TrendingUp}
                  color="text-orange-600" bg="bg-orange-50" border="border-orange-200"
                  sub="Last 30 days" onClick={() => router.push('/contacts')} />
              </div>
            </section>

            {/* ── Row 4: Bookings / Events ─────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CalendarCheck className="h-3.5 w-3.5" /> Bookings & Events (last 30 days)
                </h2>
                <button onClick={() => router.push('/bookings')} className="text-xs text-brand-500 hover:underline flex items-center gap-1">
                  Manage all <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { label: 'Demos Booked',   value: stats.events.demoBooked,        color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200'  },
                  { label: 'Callbacks',       value: stats.events.callbackRequested, color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
                  { label: 'Appointments',    value: stats.events.appointmentSet,    color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
                  { label: 'Follow Ups',      value: stats.events.followUp,          color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
                  { label: 'Not Interested',  value: stats.events.notInterested,     color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-200'    },
                ].map((s) => (
                  <button key={s.label} onClick={() => router.push('/bookings')}
                    className={cn('rounded-xl border p-3 text-center hover:shadow-md transition-shadow cursor-pointer', s.bg, s.border)}>
                    <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* ── Row 5: Three columns ─────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* Pending Actions */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> Pending Actions
                  {stats.events.pendingActions > 0 && (
                    <span className="ml-auto text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {stats.events.pendingActions}
                    </span>
                  )}
                </h3>
                {stats.upcomingEvents.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <CheckCircle2 className="h-8 w-8 text-green-400 mb-2" />
                    <p className="text-xs text-muted-foreground">All clear!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stats.upcomingEvents.slice(0, 5).map((ev) => (
                      <div key={ev.id} className="flex items-start gap-2 rounded-lg border border-border p-2">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium border shrink-0 mt-0.5', EVENT_COLORS[ev.event_type] ?? 'bg-gray-100 text-gray-700 border-gray-200')}>
                          {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{ev.contact_name}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" /> {ev.contact_phone}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{timeAgo(ev.created_at)}</p>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => router.push('/bookings')} className="w-full text-xs text-brand-500 hover:underline flex items-center justify-center gap-1 mt-1">
                      View all <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Recent Conversations */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-brand-500" /> Recent Conversations
                </h3>
                <div className="space-y-2">
                  {stats.recentConversations.slice(0, 5).map((conv) => (
                    <button key={conv.id} onClick={() => router.push(`/conversations/${conv.id}`)}
                      className="w-full flex items-start gap-2.5 rounded-lg border border-border p-2 text-left hover:border-brand-300 transition-colors">
                      <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 text-xs font-semibold text-brand-700">
                        {(conv.contact?.name ?? conv.contact?.phone ?? '?')[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate flex-1">
                            {conv.contact?.name ?? conv.contact?.phone ?? 'Unknown'}
                          </p>
                          {!conv.bot_paused && (
                            <span className="shrink-0 text-[9px] bg-green-100 text-green-700 px-1 rounded-full">Bot</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{conv.last_message}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{conv.last_message_at ? timeAgo(conv.last_message_at) : ''}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => router.push('/conversations')} className="mt-2 w-full text-xs text-brand-500 hover:underline flex items-center justify-center gap-1">
                  All conversations <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              {/* Right column: Labels + Campaigns */}
              <div className="space-y-4">
                {/* Top Labels */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <Tag className="h-4 w-4 text-brand-500" /> Top Labels
                  </h3>
                  {stats.topLabels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No labels used yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {stats.topLabels.map((l) => (
                        <span key={l.name}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium"
                          style={{ backgroundColor: `${l.color}20`, borderColor: `${l.color}40`, color: l.color }}>
                          {l.name}
                          <span className="opacity-60">{l.count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Campaigns */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <Megaphone className="h-4 w-4 text-brand-500" /> Recent Campaigns
                  </h3>
                  {stats.recentCampaigns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No campaigns yet</p>
                  ) : (
                    <div className="space-y-2">
                      {stats.recentCampaigns.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-semibold text-foreground">{c.sent_count ?? 0}</p>
                            <p className="text-[10px] text-muted-foreground">sent</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => router.push('/campaigns')} className="mt-2 w-full text-xs text-brand-500 hover:underline flex items-center justify-center gap-1">
                    All campaigns <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                {/* Quick stats bar */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4 text-brand-500" /> Quick Stats
                  </h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Bot reply rate', value: `${stats.messages.botRate}%`, color: 'bg-green-500' },
                      { label: 'Messages this week', value: stats.messages.thisWeek, color: 'bg-purple-500' },
                      { label: 'New contacts/week', value: stats.contacts.newWeek, color: 'bg-amber-500' },
                      { label: 'Total conversations', value: stats.conversations.total, color: 'bg-brand-500' },
                    ].map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={cn('h-2 w-2 rounded-full shrink-0', s.color)} />
                          <span className="text-xs text-muted-foreground truncate">{s.label}</span>
                        </div>
                        <span className="text-xs font-semibold text-foreground shrink-0">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

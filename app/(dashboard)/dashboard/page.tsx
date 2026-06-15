'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Users, Bot, CalendarCheck, Phone,
  TrendingUp, Clock, RefreshCw, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DashboardStats {
  conversations: { total: number; open: number; today: number; botActive: number };
  messages:      { today: number; thisWeek: number; botToday: number; botRate: number };
  contacts:      { total: number; newMonth: number };
  events: {
    demoBooked: number; callbackRequested: number; appointmentSet: number;
    notInterested: number; followUp: number;
  };
  upcomingEvents: Array<{
    id: string; event_type: string; contact_name: string;
    contact_phone: string; scheduled_at: string | null; location: string | null;
    status: string; created_at: string;
  }>;
  recentConversations: Array<{
    id: string; last_message: string; last_message_at: string; status: string;
    contact: { name: string; phone: string } | null;
  }>;
}

const EVENT_LABELS: Record<string, string> = {
  demo_booked: 'Demo', callback_requested: 'Callback', appointment_set: 'Appointment',
};
const EVENT_COLORS: Record<string, string> = {
  demo_booked: 'bg-green-100 text-green-700', callback_requested: 'bg-blue-100 text-blue-700',
  appointment_set: 'bg-purple-100 text-purple-700',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName   = user?.full_name?.split(' ')[0] ?? 'there';

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto w-full px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{greeting}, {firstName}! 👋</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{workspace?.name ?? 'Your workspace'} — live overview</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {loading && !stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Conversations + Messages row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Open Conversations', value: stats.conversations.open,    icon: MessageSquare, color: 'text-brand-600',  bg: 'bg-brand-50',   border: 'border-brand-200',  sub: `${stats.conversations.today} new today` },
                { label: 'Bot Active',         value: stats.conversations.botActive,icon: Bot,          color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200',  sub: `${stats.messages.botRate}% auto-replied` },
                { label: 'Messages Today',     value: stats.messages.today,        icon: TrendingUp,    color: 'text-purple-600',bg: 'bg-purple-50', border: 'border-purple-200', sub: `${stats.messages.thisWeek} this week` },
                { label: 'Total Contacts',     value: stats.contacts.total,        icon: Users,         color: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200',  sub: `+${stats.contacts.newMonth} this month` },
              ].map((card) => (
                <div key={card.label} className={cn('rounded-xl border p-4 space-y-1', card.bg, card.border)}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
                    <card.icon className={cn('h-4 w-4', card.color)} />
                  </div>
                  <p className={cn('text-2xl font-bold', card.color)}>{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.sub}</p>
                </div>
              ))}
            </div>

            {/* Bookings / Events row */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <CalendarCheck className="h-4 w-4 text-brand-500" /> Bookings & Events (last 30 days)
                </h2>
                <button onClick={() => router.push('/bookings')} className="text-xs text-brand-500 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { label: 'Demos Booked',   value: stats.events.demoBooked,        color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200'  },
                  { label: 'Callbacks',       value: stats.events.callbackRequested, color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
                  { label: 'Appointments',    value: stats.events.appointmentSet,    color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
                  { label: 'Follow Ups',      value: stats.events.followUp,          color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
                  { label: 'Not Interested',  value: stats.events.notInterested,     color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'    },
                ].map((s) => (
                  <div key={s.label} className={cn('rounded-lg border p-3 text-center', s.bg, s.border)}>
                    <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Two columns: upcoming events + recent conversations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Upcoming demos/callbacks */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-brand-500" /> Pending Actions
                </h3>
                {stats.upcomingEvents.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <CheckCircle2 className="h-8 w-8 text-green-400 mb-2" />
                    <p className="text-sm text-muted-foreground">All clear! No pending events.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stats.upcomingEvents.map((ev) => (
                      <div key={ev.id} className="flex items-start gap-2.5 rounded-lg border border-border p-2.5">
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5', EVENT_COLORS[ev.event_type] ?? 'bg-gray-100 text-gray-700')}>
                          {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{ev.contact_name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" /> {ev.contact_phone}
                          </p>
                          {ev.scheduled_at && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(ev.scheduled_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => router.push('/bookings')}
                          className="text-brand-500 hover:text-brand-600 shrink-0"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent conversations */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-brand-500" /> Recent Conversations
                </h3>
                {stats.recentConversations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No conversations yet</p>
                ) : (
                  <div className="space-y-2">
                    {stats.recentConversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => router.push(`/conversations/${conv.id}`)}
                        className="w-full flex items-start gap-2.5 rounded-lg border border-border p-2.5 text-left hover:border-brand-300 transition-colors"
                      >
                        <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 text-xs font-semibold text-brand-700">
                          {(conv.contact?.name ?? conv.contact?.phone ?? '?')[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">
                            {conv.contact?.name ?? conv.contact?.phone ?? 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                          {conv.last_message_at ? timeAgo(conv.last_message_at) : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => router.push('/conversations')}
                  className="mt-2 w-full text-xs text-brand-500 hover:underline flex items-center justify-center gap-1"
                >
                  View all conversations <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

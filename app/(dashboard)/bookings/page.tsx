'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Calendar, Phone, MapPin, Clock, CheckCircle2, XCircle,
  RefreshCw, CalendarCheck, AlertCircle, ArrowUpRight,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRequirePageRole } from '@/hooks/useRequirePageRole';

type EventType = 'demo_booked' | 'callback_requested' | 'appointment_set' | 'not_interested' | 'follow_up';
type Status    = 'pending' | 'confirmed' | 'done' | 'cancelled';

interface ConvEvent {
  id: string;
  event_type: EventType;
  contact_name: string;
  contact_phone: string;
  scheduled_at: string | null;
  location: string | null;
  notes: string | null;
  status: Status;
  google_event_id: string | null;
  created_at: string;
}

const EVENT_META: Record<EventType, { label: string; cls: string; iconBg: string }> = {
  demo_booked:        { label: 'Demo Booked',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', iconBg: 'bg-emerald-500' },
  callback_requested: { label: 'Callback',      cls: 'bg-sky-100 text-sky-700 border-sky-200',            iconBg: 'bg-sky-500'     },
  appointment_set:    { label: 'Appointment',   cls: 'bg-violet-100 text-violet-700 border-violet-200',   iconBg: 'bg-violet-500'  },
  not_interested:     { label: 'Not Interested',cls: 'bg-rose-100 text-rose-700 border-rose-200',         iconBg: 'bg-rose-500'    },
  follow_up:          { label: 'Follow Up',     cls: 'bg-amber-100 text-amber-700 border-amber-200',      iconBg: 'bg-amber-500'   },
};

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-amber-50 text-amber-700 border-amber-200'  },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  done:      { label: 'Done',      cls: 'bg-gray-100 text-gray-600 border-gray-200'    },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-600 border-red-200'        },
};

const FILTER_TYPES: Array<{ value: string; label: string }> = [
  { value: '',                   label: 'All Events'    },
  { value: 'demo_booked',        label: 'Demos'         },
  { value: 'callback_requested', label: 'Callbacks'     },
  { value: 'appointment_set',    label: 'Appointments'  },
  { value: 'follow_up',          label: 'Follow Ups'    },
  { value: 'not_interested',     label: 'Not Interested'},
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BookingsPage() {
  useRequirePageRole('bookings');
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [events, setEvents]   = useState<ConvEvent[]>([]);
  const [counts, setCounts]   = useState<Record<string, number>>({});
  const [filter, setFilter]   = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const url = `/api/bookings?workspaceId=${workspaceId}${filter ? `&type=${filter}` : ''}`;
      const res = await fetch(url);
      const data = await res.json() as { events: ConvEvent[]; counts: Record<string, number> };
      setEvents(data.events ?? []);
      setCounts(data.counts ?? {});
    } catch {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filter]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (id: string, status: Status) => {
    try {
      await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, workspaceId }),
      });
      setEvents((prev) => prev.map((e) => e.id === id ? { ...e, status } : e));
      toast.success('Status updated successfully');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const totalBookings     = (counts['demo_booked'] ?? 0) + (counts['appointment_set'] ?? 0);
  const totalCallbacks    = counts['callback_requested'] ?? 0;
  const totalFollowUps    = counts['follow_up'] ?? 0;
  const totalNotInterested = counts['not_interested'] ?? 0;
  const totalPending = events.filter((e) => e.status === 'pending').length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-sm shadow-brand-500/30">
              <CalendarCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Bookings & Events</h1>
              <p className="text-xs text-muted-foreground">Auto-detected from WhatsApp conversations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalPending > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
                <AlertCircle className="h-3.5 w-3.5" />
                {totalPending} pending
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── Stats row ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Demos & Appointments', value: totalBookings,       iconBg: 'bg-emerald-500' },
              { label: 'Callbacks',            value: totalCallbacks,      iconBg: 'bg-sky-500'     },
              { label: 'Follow Ups',           value: totalFollowUps,      iconBg: 'bg-amber-500'   },
              { label: 'Not Interested',       value: totalNotInterested,  iconBg: 'bg-rose-500'    },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-border bg-card shadow-sm p-4 flex flex-col gap-2">
                <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', stat.iconBg)}>
                  <CalendarCheck className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground tabular-nums">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Filter tabs ───────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_TYPES.map((f) => {
              const count = f.value ? counts[f.value] : undefined;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all border',
                    filter === f.value
                      ? 'bg-brand-500 text-white border-brand-500 shadow-sm shadow-brand-500/20'
                      : 'bg-card text-muted-foreground border-border hover:border-brand-300 hover:text-foreground',
                  )}
                >
                  {f.label}
                  {count != null && count > 0 && (
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
                      filter === f.value ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Event list ────────────────────────────────────────────── */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl border border-border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <CalendarCheck className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground">No events found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Events are automatically detected when customers book demos, request callbacks, or schedule appointments via WhatsApp.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const meta   = EVENT_META[event.event_type];
                const status = STATUS_META[event.status];
                return (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-border bg-card shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-4 hover:border-brand-200 transition-colors"
                  >
                    {/* Icon */}
                    <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', meta.iconBg)}>
                      <CalendarCheck className="h-5 w-5 text-white" />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex items-center gap-2 flex-wrap mb-2.5">
                        <span className={cn('text-[11px] font-semibold px-2.5 py-0.5 rounded-full border', meta.cls)}>
                          {meta.label}
                        </span>
                        <span className={cn('text-[11px] font-semibold px-2.5 py-0.5 rounded-full border capitalize', status.cls)}>
                          {status.label}
                        </span>
                        {event.google_event_id && (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <CalendarCheck className="h-3 w-3" /> Google Calendar
                          </span>
                        )}
                      </div>

                      {/* Name */}
                      <p className="text-sm font-bold text-foreground">{event.contact_name}</p>

                      {/* Details row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" /> {event.contact_phone}
                        </span>
                        {event.scheduled_at && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 shrink-0" />
                            {new Date(event.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        )}
                        {event.location && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" /> {event.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3 shrink-0" />
                          Detected {timeAgo(event.created_at)}
                        </span>
                      </div>

                      {/* Notes */}
                      {event.notes && (
                        <p className="mt-2.5 text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 line-clamp-2 border border-border">
                          {event.notes}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0 sm:mt-0">
                      {event.status === 'pending' && (
                        <>
                          <Button size="sm" variant="outline"
                            className="h-8 text-xs gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
                            onClick={() => void updateStatus(event.id, 'confirmed')}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
                          </Button>
                          <Button size="sm" variant="outline"
                            className="h-8 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                            onClick={() => void updateStatus(event.id, 'cancelled')}>
                            <XCircle className="h-3.5 w-3.5" /> Decline
                          </Button>
                        </>
                      )}
                      {event.status === 'confirmed' && (
                        <Button size="sm" variant="outline"
                          className="h-8 text-xs gap-1.5 border-brand-200 text-brand-600 hover:bg-brand-50"
                          onClick={() => void updateStatus(event.id, 'done')}>
                          <ArrowUpRight className="h-3.5 w-3.5" /> Mark as Done
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

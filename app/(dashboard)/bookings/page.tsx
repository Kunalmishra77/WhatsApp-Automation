'use client';

import { useEffect, useState, useCallback } from 'react';
import { Calendar, Phone, MapPin, Clock, CheckCircle2, XCircle, RefreshCw, CalendarCheck } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

const EVENT_LABELS: Record<EventType, string> = {
  demo_booked:         'Demo Booked',
  callback_requested:  'Callback',
  appointment_set:     'Appointment',
  not_interested:      'Not Interested',
  follow_up:           'Follow Up',
};

const EVENT_COLORS: Record<EventType, string> = {
  demo_booked:        'bg-green-100 text-green-800 border-green-200',
  callback_requested: 'bg-blue-100 text-blue-800 border-blue-200',
  appointment_set:    'bg-purple-100 text-purple-800 border-purple-200',
  not_interested:     'bg-red-100 text-red-800 border-red-200',
  follow_up:          'bg-amber-100 text-amber-800 border-amber-200',
};

const STATUS_COLORS: Record<Status, string> = {
  pending:   'bg-amber-50 text-amber-700',
  confirmed: 'bg-green-50 text-green-700',
  done:      'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-50 text-red-700',
};

const FILTER_TYPES: Array<{ value: string; label: string }> = [
  { value: '',                  label: 'All' },
  { value: 'demo_booked',       label: 'Demos' },
  { value: 'callback_requested',label: 'Callbacks' },
  { value: 'appointment_set',   label: 'Appointments' },
  { value: 'follow_up',         label: 'Follow Ups' },
  { value: 'not_interested',    label: 'Not Interested' },
];

export default function BookingsPage() {
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
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const totalBookings = (counts['demo_booked'] ?? 0) + (counts['appointment_set'] ?? 0);
  const totalCallbacks = counts['callback_requested'] ?? 0;
  const totalFollowUps = counts['follow_up'] ?? 0;
  const totalNotInterested = counts['not_interested'] ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-brand-500" />
            Bookings & Events
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Auto-detected from WhatsApp conversations</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Demos & Appointments', value: totalBookings,      color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
            { label: 'Callbacks',            value: totalCallbacks,     color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'  },
            { label: 'Follow Ups',           value: totalFollowUps,     color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
            { label: 'Not Interested',       value: totalNotInterested, color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'   },
          ].map((stat) => (
            <div key={stat.label} className={cn('rounded-xl border p-4', stat.bg, stat.border)}>
              <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_TYPES.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                filter === f.value
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white text-muted-foreground border-border hover:border-brand-300',
              )}
            >
              {f.label}
              {f.value && counts[f.value] ? (
                <span className="ml-1.5 opacity-70">{counts[f.value]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Event list */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No events yet</p>
            <p className="text-xs text-muted-foreground mt-1">Events are auto-detected from WhatsApp conversations</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-start gap-3"
              >
                {/* Left: type badge + contact */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', EVENT_COLORS[event.event_type])}>
                      {EVENT_LABELS[event.event_type]}
                    </span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[event.status])}>
                      {event.status}
                    </span>
                    {event.google_event_id && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CalendarCheck className="h-3 w-3" /> Google Calendar
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-semibold text-foreground">{event.contact_name}</p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {event.contact_phone}
                    </span>
                    {event.scheduled_at && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(event.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}
                    {event.location && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {event.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(event.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  {event.notes && (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2 bg-muted/40 rounded px-2 py-1">
                      {event.notes}
                    </p>
                  )}
                </div>

                {/* Right: status actions */}
                {event.status === 'pending' && (
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50"
                      onClick={() => void updateStatus(event.id, 'confirmed')}
                    >
                      <CheckCircle2 className="h-3 w-3" /> Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => void updateStatus(event.id, 'cancelled')}
                    >
                      <XCircle className="h-3 w-3" /> Cancel
                    </Button>
                  </div>
                )}
                {event.status === 'confirmed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => void updateStatus(event.id, 'done')}
                  >
                    Mark Done
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { Bell, Ticket, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/services/supabase/client';
import { Badge } from '@/components/ui/badge';

interface TicketNotif {
  id: string;
  subject: string;
  workspace_name: string;
  priority: string;
  created_at: string;
  seen: boolean;
}

const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700', urgent: 'bg-red-100 text-red-700',
};

export function AdminNotificationBell() {
  const [open,    setOpen]    = useState(false);
  const [notifs,  setNotifs]  = useState<TicketNotif[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const unseenCount = notifs.filter(n => !n.seen).length;

  // Load recent open tickets on mount
  useEffect(() => {
    fetch('/api/admin/support-tickets?status=open')
      .then(r => r.json() as Promise<{ tickets: Array<{ id: string; subject: string; priority: string; created_at: string; workspaces?: { name: string } | null }> }>)
      .then(d => {
        setNotifs((d.tickets ?? []).slice(0, 20).map(t => ({
          id:             t.id,
          subject:        t.subject,
          workspace_name: t.workspaces?.name ?? 'Unknown',
          priority:       t.priority,
          created_at:     t.created_at,
          seen:           false,
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Realtime subscription for new tickets
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel('admin-new-tickets')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_tickets',
      }, (payload) => {
        const t = payload.new as { id: string; subject: string; priority: string; created_at: string; workspace_id: string };
        setNotifs(prev => [{
          id:             t.id,
          subject:        t.subject,
          workspace_name: 'New client',
          priority:       t.priority,
          created_at:     t.created_at,
          seen:           false,
        }, ...prev].slice(0, 20));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllSeen = () => setNotifs(prev => prev.map(n => ({ ...n, seen: true })));
  const remove = (id: string) => setNotifs(prev => prev.filter(n => n.id !== id));

  const formatTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) markAllSeen(); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Support Tickets</p>
            <div className="flex items-center gap-2">
              {notifs.length > 0 && (
                <button onClick={() => setNotifs([])} className="text-xs text-muted-foreground hover:text-foreground">Clear all</button>
              )}
              <button onClick={() => setOpen(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="text-center py-6 text-sm text-muted-foreground">Loading…</div>
            ) : notifs.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <Ticket className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                No open tickets
              </div>
            ) : (
              notifs.map(n => (
                <div key={n.id} className={cn('flex items-start gap-3 px-4 py-3', !n.seen && 'bg-brand-50/50')}>
                  <Ticket className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{n.subject}</p>
                    <p className="text-[11px] text-muted-foreground">{n.workspace_name} · {formatTime(n.created_at)}</p>
                    <Badge className={cn('text-[10px] px-1 mt-1', PRIORITY_COLOR[n.priority] ?? '')}>{n.priority}</Badge>
                  </div>
                  <button onClick={() => remove(n.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

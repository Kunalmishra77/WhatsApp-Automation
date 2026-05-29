'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/services/supabase/client';

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions<T extends Record<string, unknown>> {
  table: string;
  event?: PostgresEvent;
  filter?: string;
  onEvent: (payload: { eventType: PostgresEvent; new: T; old: Partial<T> }) => void;
  enabled?: boolean;
}

export function useRealtime<T extends Record<string, unknown>>({
  table,
  event = '*',
  filter,
  onEvent,
  enabled = true,
}: UseRealtimeOptions<T>): void {
  const channelRef  = useRef<RealtimeChannel | null>(null);
  const onEventRef  = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const supabase     = createClient();
    const channelName  = `rt:${table}:${filter ?? 'all'}:${event}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => {
          onEventRef.current({
            eventType: payload.eventType as PostgresEvent,
            new:       payload.new as T,
            old:       payload.old as Partial<T>,
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [table, event, filter, enabled]);
}

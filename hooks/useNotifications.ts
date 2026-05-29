'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/services/supabase/client';
import { useAuthStore } from '@/store/auth.store';
import { useNotificationStore } from '@/store/notification.store';
import { REALTIME_CHANNELS } from '@/realtime/channels';
import type { Database } from '@/types/database.types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

export function useNotifications(): void {
  const user            = useAuthStore((s) => s.user);
  const setUnreadCount  = useNotificationStore((s) => s.setUnreadCount);
  const incrementUnread = useNotificationStore((s) => s.incrementUnread);

  const fetchUnreadCount = useCallback(async (userId: string) => {
    const supabase = createClient();
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (count !== null) setUnreadCount(count);
  }, [setUnreadCount]);

  useEffect(() => {
    if (!user?.id) return;

    void fetchUnreadCount(user.id);

    const supabase = createClient();
    const channel  = supabase
      .channel(REALTIME_CHANNELS.NOTIFICATIONS(user.id))
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as NotificationRow;
          if (!n.is_read) incrementUnread();
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchUnreadCount, incrementUnread]);
}

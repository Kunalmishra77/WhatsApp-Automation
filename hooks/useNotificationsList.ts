'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/services/supabase/client';
import { useAuthStore } from '@/store/auth.store';
import { useNotificationStore } from '@/store/notification.store';
import type { Database } from '@/types/database.types';

export type NotificationRow = Database['public']['Tables']['notifications']['Row'];

// List of recent notifications for the Bell dropdown — separate from
// hooks/useNotifications.ts, which only tracks the unread count + realtime
// subscription. RLS (notifications_own) already scopes to the caller, so this
// queries the regular client directly rather than going through an API route.
export function useNotificationsList() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery<NotificationRow[]>({
    queryKey: ['notifications-list', userId],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return async (id: string) => {
    const supabase = createClient() as any;
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('is_read', false);
    setUnreadCount(Math.max(0, unreadCount - 1));
    void queryClient.invalidateQueries({ queryKey: ['notifications-list', userId] });
  };
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const clearUnread = useNotificationStore((s) => s.clearUnread);

  return async () => {
    if (!userId) return;
    const supabase = createClient() as any;
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);
    clearUnread();
    void queryClient.invalidateQueries({ queryKey: ['notifications-list', userId] });
  };
}

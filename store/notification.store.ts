import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface NotificationState {
  unreadCount: number;
  soundEnabled: boolean;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;
  toggleSound: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  devtools(
    persist(
      (set) => ({
        unreadCount:  0,
        soundEnabled: true,

        setUnreadCount:  (count) => set({ unreadCount: count }, false, 'notifications/setCount'),
        incrementUnread: ()      => set((s) => ({ unreadCount: s.unreadCount + 1 }), false, 'notifications/increment'),
        clearUnread:     ()      => set({ unreadCount: 0 }, false, 'notifications/clear'),
        toggleSound:     ()      => set((s) => ({ soundEnabled: !s.soundEnabled }), false, 'notifications/toggleSound'),
      }),
      { name: 'agentix-notifications' }
    ),
    { name: 'NotificationStore' }
  )
);

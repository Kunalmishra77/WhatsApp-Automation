'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/services/supabase/client';
import { REALTIME_CHANNELS } from '@/realtime/channels';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAuthStore } from '@/store/auth.store';

interface PresenceState {
  user_id:              string;
  status:               'online' | 'away';
  current_conversation: string | null;
}

export function usePresence(): void {
  const channelRef     = useRef<RealtimeChannel | null>(null);
  const workspace      = useWorkspaceStore((s) => s.activeWorkspace);
  const user           = useAuthStore((s) => s.user);
  const setAgentOnline = useWorkspaceStore((s) => s.setAgentOnline);

  useEffect(() => {
    if (!workspace?.id || !user?.id) return;

    const supabase    = createClient();
    const channelName = REALTIME_CHANNELS.AGENT_PRESENCE(workspace.id);

    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        Object.keys(state).forEach((uid) => setAgentOnline(uid, true));
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setAgentOnline(key as string, true);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setAgentOnline(key as string, false);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id:              user.id,
            status:               'online',
            current_conversation: null,
          } satisfies PresenceState);
        }
      });

    channelRef.current = channel;

    const handleUnload = () => { void channel.untrack(); };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      void channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [workspace?.id, user?.id, setAgentOnline]);
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/services/supabase/client';
import { useAuthStore } from '@/store/auth.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { UserRole } from '@/types/auth.types';

// Current user's role in the active workspace — used for client-side nav
// filtering and page guards. workspace.store's `members` array is only
// populated on-demand by a few components (ConversationHeader's assign
// dropdown, admin client detail), so it can't be relied on globally; this
// hook fetches+caches the single row directly, independent of that.
export function useCurrentRole() {
  const userId      = useAuthStore((s) => s.user?.id);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  return useQuery<UserRole | null>({
    queryKey: ['current-role', workspaceId, userId],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await (supabase as any)
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();
      return (data?.role as UserRole | undefined) ?? null;
    },
    enabled: !!workspaceId && !!userId,
    staleTime: 5 * 60_000,
  });
}

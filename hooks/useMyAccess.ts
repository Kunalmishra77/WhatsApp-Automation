'use client';

import { useQuery } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { AgentPageKey } from '@/lib/agent-pages';
import type { Permission, UserRole } from '@/types/auth.types';

export interface MyAccess {
  role: UserRole | null;
  customRoleName: string | null;
  isSuspended: boolean;
  permissions: Permission[];
  /** null = not page-restricted, so the UI should show everything. */
  pageAccess: AgentPageKey[] | null;
}

/**
 * The current user's own resolved access, straight from the same resolver the
 * API gates use (lib/permissions.ts via /api/team/my-access).
 *
 * Replaces reading the workspace-wide agent page list: that list was shared by
 * every agent and ignored custom roles and per-member overrides, so the nav
 * could show items the server would refuse — and hide items it would allow.
 */
export function useMyAccess() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  return useQuery<MyAccess>({
    queryKey: ['my-access', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/team/my-access?workspaceId=${workspaceId}`);
      if (!res.ok) {
        // Fail open on the client only — every page and API is guarded server
        // side, so a failed read here can never grant real access.
        return { role: null, customRoleName: null, isSuspended: false, permissions: [], pageAccess: null };
      }
      return res.json() as Promise<MyAccess>;
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

/** Convenience: does the current user hold this permission? */
export function useHasPermission(permission: Permission): boolean {
  const { data } = useMyAccess();
  return (data?.permissions ?? []).includes(permission);
}

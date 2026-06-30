'use client';

import { useQuery } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { DEFAULT_AGENT_ALLOWED_PAGES, type AgentPageKey } from '@/lib/agent-pages';

// Which restricted pages the workspace admin has granted to the 'agent' role.
// Used by the Sidebar (to show/hide nav items) and page guards (to block direct
// URL navigation) — both need the same source of truth, fetched once and cached.
export function useAgentPageAccess() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  return useQuery<AgentPageKey[]>({
    queryKey: ['agent-page-access', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/team/page-access?workspaceId=${workspaceId}`);
      if (!res.ok) return DEFAULT_AGENT_ALLOWED_PAGES;
      const data = await res.json() as { agentPageAccess: AgentPageKey[] };
      return data.agentPageAccess;
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

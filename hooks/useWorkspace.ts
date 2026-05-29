'use client';

import { useWorkspaceStore } from '@/store/workspace.store';

export function useWorkspace() {
  const { activeWorkspace, workspaces, members, onlineAgentIds } = useWorkspaceStore();

  return {
    workspace:    activeWorkspace,
    workspaces,
    members,
    onlineAgentIds,
    isConfigured: Boolean(activeWorkspace?.waba_id && activeWorkspace.phone_number_id),
  };
}

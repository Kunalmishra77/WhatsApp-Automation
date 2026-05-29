import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  waba_id: string | null;
  phone_number_id: string | null;
}

interface WorkspaceMember {
  id: string;
  user_id: string;
  role: string;
  is_online: boolean;
}

interface WorkspaceState {
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  members: WorkspaceMember[];
  onlineAgentIds: Set<string>;
  setActiveWorkspace: (workspace: Workspace | null) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setMembers: (members: WorkspaceMember[]) => void;
  setAgentOnline: (agentId: string, online: boolean) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    (set) => ({
      activeWorkspace: null,
      workspaces:      [],
      members:         [],
      onlineAgentIds:  new Set(),

      setActiveWorkspace: (workspace) =>
        set({ activeWorkspace: workspace }, false, 'workspace/setActive'),

      setWorkspaces: (workspaces) =>
        set({ workspaces }, false, 'workspace/setAll'),

      setMembers: (members) =>
        set({ members }, false, 'workspace/setMembers'),

      setAgentOnline: (agentId, online) =>
        set(
          (state) => {
            const next = new Set(state.onlineAgentIds);
            if (online) next.add(agentId);
            else next.delete(agentId);
            return { onlineAgentIds: next };
          },
          false,
          'workspace/setAgentOnline'
        ),

      reset: () =>
        set(
          { activeWorkspace: null, workspaces: [], members: [], onlineAgentIds: new Set() },
          false,
          'workspace/reset'
        ),
    }),
    { name: 'WorkspaceStore' }
  )
);

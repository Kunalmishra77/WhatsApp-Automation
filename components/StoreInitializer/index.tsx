'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useWorkspaceStore } from '@/store/workspace.store';

interface InitUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
}

interface InitWorkspace {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  waba_id: string | null;
  phone_number_id: string | null;
}

interface StoreInitializerProps {
  user: InitUser;
  workspace: InitWorkspace;
  /**
   * Every workspace this user belongs to. Seeded so the UI can offer a switcher
   * to anyone who is in more than one — previously the store only ever knew
   * about the active workspace, so a member of two teams had no way back to the
   * other one from inside the portal.
   */
  workspaces?: InitWorkspace[];
}

export function StoreInitializer({ user, workspace, workspaces }: StoreInitializerProps) {
  const setUser            = useAuthStore((s) => s.setUser);
  const setLoading         = useAuthStore((s) => s.setLoading);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const setWorkspaces      = useWorkspaceStore((s) => s.setWorkspaces);

  useEffect(() => {
    setUser(user);
    setLoading(false);
    setActiveWorkspace(workspace);
    setWorkspaces(workspaces ?? [workspace]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, workspace.id, workspaces?.length]);

  return null;
}

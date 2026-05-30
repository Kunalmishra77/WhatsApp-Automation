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
}

export function StoreInitializer({ user, workspace }: StoreInitializerProps) {
  const setUser            = useAuthStore((s) => s.setUser);
  const setLoading         = useAuthStore((s) => s.setLoading);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  useEffect(() => {
    setUser(user);
    setLoading(false);
    setActiveWorkspace(workspace);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, workspace.id]);

  return null;
}

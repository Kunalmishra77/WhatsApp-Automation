'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentRole } from './useCurrentRole';
import { useAgentPageAccess } from './useAgentPageAccess';
import type { AgentPageKey } from '@/lib/agent-pages';

// Client-side equivalent of lib/page-guard.ts's requirePageRole, for pages that
// must stay 'use client'. Only the 'agent' role is ever redirected — admins
// configure exactly which pages an agent can reach from the Team page.
export function useRequirePageRole(pageKey: AgentPageKey): void {
  const { data: role, isLoading: roleLoading } = useCurrentRole();
  const { data: allowed, isLoading: accessLoading } = useAgentPageAccess();
  const router = useRouter();

  useEffect(() => {
    if (roleLoading || accessLoading) return;
    if (role === 'agent' && !(allowed ?? []).includes(pageKey)) {
      router.replace('/conversations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, allowed, roleLoading, accessLoading]);
}

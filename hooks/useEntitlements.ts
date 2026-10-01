'use client';

import { useQuery } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { Entitlements, ModuleKey } from '@/lib/entitlements';

// Client hook for the active workspace's entitlements (modules, trial, caps).
// Defaults to everything-enabled while loading so the UI never flickers locked
// for an entitled user; the server still enforces access on every gated action.
const OPTIMISTIC: Entitlements = {
  accessAllowed: true,
  trialing: false,
  trialDaysLeft: null,
  modules: { whatsapp: true, instagram: true, google_growth: true },
  caps: { aiRepliesPerMonth: null, campaigns: null, campaignRecipients: null },
};

export function useEntitlements(): { entitlements: Entitlements; isLoading: boolean } {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const { data, isLoading } = useQuery({
    queryKey: ['entitlements', workspaceId],
    queryFn: () => fetch(`/api/entitlements?workspaceId=${workspaceId}`).then((r) => r.json() as Promise<Entitlements>),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
  return { entitlements: data ?? OPTIMISTIC, isLoading: isLoading && !data };
}

export function hasModule(e: Entitlements, m: ModuleKey): boolean {
  return e.modules?.[m] === true;
}

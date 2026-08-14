'use client';

import { useCurrentRole } from '@/hooks/useCurrentRole';
import { MyWorkDashboard } from '@/modules/dashboard/components/MyWorkDashboard';
import { CommandCenter } from '@/modules/dashboard/components/CommandCenter';

// Agents get a focused "My Work" summary — matches the assignment-only data they
// can actually see under RLS isolation. Everyone else gets the full CommandCenter
// workspace overview (KPI strip + message analytics + campaign performance).
export default function DashboardPage() {
  const { data: role } = useCurrentRole();
  const isAgent = role === 'agent';

  if (isAgent) {
    return <MyWorkDashboard />;
  }

  return <CommandCenter />;
}

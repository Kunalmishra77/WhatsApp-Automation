'use client';

import { useQuery } from '@tanstack/react-query';
import { ClientList } from '@/modules/admin/components/ClientList';
import type { WorkspaceRow } from '@/app/api/admin/workspaces/route';

export default function ClientsPage() {
  const { data: wsData, isLoading, refetch } = useQuery({
    queryKey: ['admin-workspaces'],
    queryFn: () => fetch('/api/admin/workspaces').then(r => r.json()),
  });

  const workspaces: WorkspaceRow[] = wsData?.workspaces ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage all workspace accounts</p>
      </div>
      <ClientList
        workspaces={workspaces}
        loading={isLoading}
        onRefetch={() => void refetch()}
      />
    </div>
  );
}

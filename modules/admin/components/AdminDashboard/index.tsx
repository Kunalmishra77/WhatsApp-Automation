'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, TrendingUp, AlertCircle, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ClientList } from '../ClientList';
import { CreateClientModal } from '../CreateClientModal';
import type { WorkspaceRow } from '@/app/api/admin/workspaces/route';

interface AdminStats {
  total_workspaces: number;
  active_workspaces: number;
  halted_workspaces: number;
  mrr: number;
  messages_today: number;
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold text-foreground">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminDashboard() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: statsData,
    isLoading: statsLoading,
  } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const {
    data: workspacesData,
    isLoading: workspacesLoading,
    refetch: refetchWorkspaces,
  } = useQuery<{ workspaces: WorkspaceRow[] }>({
    queryKey: ['admin-workspaces'],
    queryFn: async () => {
      const res = await fetch('/api/admin/workspaces');
      if (!res.ok) throw new Error('Failed to fetch workspaces');
      return res.json();
    },
  });

  const handleRefetch = () => {
    void refetchWorkspaces();
  };

  const filteredWorkspaces = (workspacesData?.workspaces ?? []).filter((w) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      w.name.toLowerCase().includes(q) ||
      (w.owner_email ?? '').toLowerCase().includes(q) ||
      w.slug.toLowerCase().includes(q)
    );
  });

  const formatMRR = (amount: number) =>
    `₹${amount.toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage all client workspaces and platform usage
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add New Client
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Workspaces"
          value={statsData?.total_workspaces ?? 0}
          icon={Building2}
          loading={statsLoading}
        />
        <StatCard
          title="Active Workspaces"
          value={statsData?.active_workspaces ?? 0}
          icon={CheckCircle2}
          description="Active & paid"
          loading={statsLoading}
        />
        <StatCard
          title="Monthly Recurring Revenue"
          value={statsLoading ? '...' : formatMRR(statsData?.mrr ?? 0)}
          icon={TrendingUp}
          description="Active paid plans"
          loading={statsLoading}
        />
        <StatCard
          title="Halted (Payment Failed)"
          value={statsData?.halted_workspaces ?? 0}
          icon={AlertCircle}
          description="Subscription halted"
          loading={statsLoading}
        />
      </div>

      {/* Client list section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Client Workspaces</h2>
          <div className="text-sm text-muted-foreground">
            {workspacesLoading ? (
              <Skeleton className="h-4 w-24 inline-block" />
            ) : (
              `${filteredWorkspaces.length} of ${workspacesData?.workspaces.length ?? 0} shown`
            )}
          </div>
        </div>

        <Input
          placeholder="Search by name, email or slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        <ClientList
          workspaces={filteredWorkspaces}
          loading={workspacesLoading}
          onRefetch={handleRefetch}
        />
      </div>

      {/* Create client modal */}
      <CreateClientModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleRefetch}
      />
    </div>
  );
}

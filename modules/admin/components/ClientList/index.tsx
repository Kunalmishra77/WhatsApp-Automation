'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldOff, ShieldCheck, Loader2, Globe, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { WorkspaceRow } from '@/app/api/admin/workspaces/route';
import { ClientDetail } from '@/modules/admin/components/ClientDetail';

const PLAN_BADGE: Record<string, { label: string; className: string }> = {
  free:       { label: 'Free',       className: 'bg-gray-100 text-gray-700 border-gray-200' },
  starter:    { label: 'Starter',    className: 'bg-blue-100 text-blue-700 border-blue-200' },
  pro:        { label: 'Pro',        className: 'bg-violet-100 text-violet-700 border-violet-200' },
  enterprise: { label: 'Enterprise', className: 'bg-amber-100 text-amber-700 border-amber-200' },
};

function PlanBadge({ plan }: { plan: string }) {
  const cfg = PLAN_BADGE[plan] ?? PLAN_BADGE.free!;
  return (
    <Badge variant="outline" className={`text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

function StatusBadge({ isActive, status }: { isActive: boolean; status: string }) {
  if (status === 'pending_approval') {
    return (
      <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
        Pending
      </Badge>
    );
  }
  if (!isActive) {
    return (
      <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
        Blocked
      </Badge>
    );
  }
  if (status === 'halted') {
    return (
      <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
        Halted
      </Badge>
    );
  }
  if (status === 'trialing') {
    return (
      <Badge variant="outline" className="text-xs bg-sky-50 text-sky-600 border-sky-200">
        Trial
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
      Active
    </Badge>
  );
}

interface ClientListProps {
  workspaces: WorkspaceRow[];
  loading: boolean;
  onRefetch: () => void;
}

export function ClientList({ workspaces, loading, onRefetch }: ClientListProps) {
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [editingDomain, setEditingDomain] = useState<string | null>(null);
  const [domainValue, setDomainValue] = useState<string>('');
  const [savingDomain, setSavingDomain] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval]         = useState<string | null>(null);
  const [pendingDelete, setPendingDelete]               = useState<string | null>(null);
  const [confirmDeleteWorkspace, setConfirmDeleteWorkspace] = useState<WorkspaceRow | null>(null);
  const [detailWorkspace, setDetailWorkspace] = useState<WorkspaceRow | null>(null);

  const handleAuthError = (status: number) => {
    if (status === 403 || status === 401) {
      alert('Session expired or wrong account. Please login as admin again.');
      window.location.href = '/login?reason=session_expired';
    }
  };

  const handleToggleBlock = async (workspace: WorkspaceRow) => {
    setPendingBlock(workspace.id);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !workspace.is_active }),
      });
      if (!res.ok) { handleAuthError(res.status); throw new Error('Failed'); }
      toast.success(
        workspace.is_active
          ? `${workspace.name} has been blocked`
          : `${workspace.name} has been unblocked`
      );
      onRefetch();
    } catch {
      toast.error('Failed to update workspace status');
    } finally {
      setPendingBlock(null);
    }
  };

  const handleChangePlan = async (workspace: WorkspaceRow, newPlan: string) => {
    if (newPlan === workspace.plan) return;
    setPendingPlan(workspace.id);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`${workspace.name} plan changed to ${newPlan}`);
      onRefetch();
    } catch {
      toast.error('Failed to change plan');
    } finally {
      setPendingPlan(null);
    }
  };

  const handleOpenDomainEdit = (workspace: WorkspaceRow) => {
    setEditingDomain(workspace.id);
    setDomainValue(workspace.custom_domain ?? '');
  };

  const handleSaveDomain = async (workspace: WorkspaceRow) => {
    setSavingDomain(workspace.id);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_domain: domainValue.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Custom domain saved');
      setEditingDomain(null);
      onRefetch();
    } catch {
      toast.error('Failed to save custom domain');
    } finally {
      setSavingDomain(null);
    }
  };

  const handleApprove = async (workspace: WorkspaceRow) => {
    setPendingApproval(workspace.id);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_status: 'active' }),
      });
      if (!res.ok) { handleAuthError(res.status); throw new Error('Failed'); }
      toast.success(`${workspace.name} approved and activated`);
      onRefetch();
    } catch {
      toast.error('Failed to approve workspace');
    } finally {
      setPendingApproval(null);
    }
  };

  const handleDelete = async (workspace: WorkspaceRow) => {
    setConfirmDeleteWorkspace(null);
    setPendingDelete(workspace.id);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success(`${workspace.name} deleted`);
      onRefetch();
    } catch {
      toast.error('Failed to delete workspace');
    } finally {
      setPendingDelete(null);
    }
  };

  const handleReject = async (workspace: WorkspaceRow) => {
    setPendingApproval(`reject-${workspace.id}`);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_status: 'cancelled', is_active: false }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`${workspace.name} rejected`);
      onRefetch();
    } catch {
      toast.error('Failed to reject workspace');
    } finally {
      setPendingApproval(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Messages</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Custom Domain</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-muted-foreground text-sm">
        No workspaces found.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Workspace</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Messages</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="min-w-[200px]">Custom Domain</TableHead>
            <TableHead className="text-right min-w-[220px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workspaces.map((w) => {
            const isBlockPending = pendingBlock === w.id;
            const isPlanPending = pendingPlan === w.id;
            const messagesDisplay = `${w.messages_this_month.toLocaleString('en-IN')} / ${w.plan_limit_messages.toLocaleString('en-IN')}`;

            return (
              <TableRow key={w.id} className={!w.is_active ? 'opacity-60' : undefined}>
                <TableCell>
                  <div>
                    <button
                      onClick={() => setDetailWorkspace(w)}
                      className="font-medium text-foreground text-sm hover:underline hover:text-brand-600 text-left"
                    >
                      {w.name}
                    </button>
                    <div className="text-xs text-muted-foreground">{w.slug}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <PlanBadge plan={w.plan} />
                </TableCell>
                <TableCell>
                  <StatusBadge isActive={w.is_active} status={w.subscription_status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground tabular-nums">
                  {messagesDisplay}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {w.member_count}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                  {w.owner_email ?? '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {editingDomain === w.id ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={domainValue}
                          onChange={(e) => setDomainValue(e.target.value)}
                          placeholder="crm.client.com"
                          className="h-7 text-xs w-40"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSaveDomain(w);
                            if (e.key === 'Escape') setEditingDomain(null);
                          }}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => void handleSaveDomain(w)}
                          disabled={savingDomain === w.id}
                        >
                          {savingDomain === w.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2"
                          onClick={() => setEditingDomain(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        CNAME: <code className="bg-muted px-1 rounded">agentix-cname.vercel.app</code>
                      </p>
                    </div>
                  ) : w.custom_domain ? (
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[140px]" title={w.custom_domain}>{w.custom_domain}</span>
                      {w.plan === 'enterprise' && (
                        <button
                          onClick={() => handleOpenDomainEdit(w)}
                          className="text-xs text-blue-600 hover:underline shrink-0"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ) : w.plan === 'enterprise' ? (
                    <button
                      onClick={() => handleOpenDomainEdit(w)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Set Domain
                    </button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    {/* Approve / Reject for pending workspaces */}
                    {w.subscription_status === 'pending_approval' && (
                      <>
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => void handleApprove(w)}
                          disabled={!!pendingApproval}
                        >
                          {pendingApproval === w.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Approve'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => void handleReject(w)}
                          disabled={!!pendingApproval}
                        >
                          {pendingApproval === `reject-${w.id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Reject'
                          )}
                        </Button>
                      </>
                    )}

                    {/* Change plan */}
                    <div className="w-32">
                      {isPlanPending ? (
                        <div className="flex items-center justify-center h-9">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <Select
                          value={w.plan}
                          onValueChange={(val) => handleChangePlan(w, val)}
                          disabled={isPlanPending}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="starter">Starter</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Block / Unblock */}
                    <Button
                      variant={w.is_active ? 'outline' : 'secondary'}
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => handleToggleBlock(w)}
                      disabled={isBlockPending}
                    >
                      {isBlockPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : w.is_active ? (
                        <>
                          <ShieldOff className="h-3 w-3" />
                          Block
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3 w-3" />
                          Unblock
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setConfirmDeleteWorkspace(w)}
                      disabled={pendingDelete === w.id}
                    >
                      {pendingDelete === w.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <><Trash2 className="h-3 w-3" />Delete</>}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Client Detail Dialog */}
      {detailWorkspace && (
        <ClientDetail
          workspace={detailWorkspace}
          onClose={() => setDetailWorkspace(null)}
          onRefetch={onRefetch}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteWorkspace}
        title={`Delete "${confirmDeleteWorkspace?.name}"?`}
        description="This will permanently delete the workspace and its auth user. This cannot be undone."
        confirmLabel="Delete Workspace"
        loading={pendingDelete === confirmDeleteWorkspace?.id}
        onConfirm={() => confirmDeleteWorkspace && void handleDelete(confirmDeleteWorkspace)}
        onCancel={() => setConfirmDeleteWorkspace(null)}
      />
    </div>
  );
}

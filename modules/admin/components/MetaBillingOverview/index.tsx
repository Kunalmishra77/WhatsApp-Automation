'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { RefreshCw, Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const RATES = { marketing: 0.58, utility: 0.14, auth: 0.14, service: 0.29 };

interface Snapshot {
  id: string;
  workspace_id: string;
  waba_id: string;
  month: string;
  marketing_count: number;
  utility_count: number;
  auth_count: number;
  service_count: number;
  total_inr: number;
  fetched_at: string;
  workspaces: { name: string; is_active: boolean; subscription_status: string } | null;
}

export function MetaBillingOverview() {
  const router = useRouter();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    workspace_id: '',
    marketing_count: '0',
    utility_count: '0',
    auth_count: '0',
    service_count: '0',
  });

  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ snapshots: Snapshot[] }>({
    queryKey: ['meta-billing'],
    queryFn: () => fetch('/api/admin/meta-billing').then(r => r.json()),
  });

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/meta-billing?sync=1');
      const d = await res.json() as { snapshots: Snapshot[] };
      await refetch();
      toast.success(`Synced! ${d.snapshots?.length ?? 0} WABAs updated`);
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const saveMut = useMutation({
    mutationFn: (body: object) =>
      fetch('/api/admin/meta-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['meta-billing'] });
      setAddOpen(false);
    },
    onError: () => toast.error('Failed to save'),
  });

  const snapshots = data?.snapshots ?? [];
  const totalInr = snapshots.reduce((a, s) => a + (s.total_inr ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Meta Spend (This Month)</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              ₹{totalInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400 mt-1">{snapshots.length} WABAs tracked</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              disabled={syncing}
              onClick={handleSyncAll}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing from Meta...' : 'Sync All WABAs'}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs text-white"
              style={{ backgroundColor: '#F97316' }}
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Add Usage
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Client</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Marketing</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Utility</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Service</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && snapshots.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-sm text-gray-400 py-12">
                  No billing data yet. Click &quot;Add Usage&quot; to enter conversation counts.
                </td>
              </tr>
            )}
            {snapshots.map(s => (
              <tr
                key={s.id}
                className="border-b border-gray-50 hover:bg-orange-50/20 cursor-pointer transition-colors"
                onClick={() => router.push(`/admin/meta-billing/${s.workspace_id}`)}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-500">
                      {s.workspaces?.name?.[0]?.toUpperCase() ?? 'W'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{s.workspaces?.name ?? s.workspace_id}</p>
                      <p className="text-xs text-gray-400">{s.waba_id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{s.marketing_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-gray-600">{s.utility_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-gray-600">{s.service_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">
                  ₹{(s.total_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Usage Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Meta Usage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs">Workspace ID</Label>
              <Input
                value={form.workspace_id}
                onChange={e => setForm(f => ({ ...f, workspace_id: e.target.value }))}
                placeholder="uuid..."
                className="mt-1"
              />
            </div>
            {(['marketing_count', 'utility_count', 'auth_count', 'service_count'] as const).map(k => (
              <div key={k}>
                <Label className="text-xs capitalize">{k.replace('_count', '')} Conversations</Label>
                <Input
                  type="number"
                  value={form[k]}
                  onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  className="mt-1"
                />
              </div>
            ))}
            <div className="bg-orange-50 rounded-xl p-3 text-sm">
              <p className="font-semibold text-orange-800">Estimated Charge</p>
              <p className="text-orange-700 text-lg font-bold mt-1">
                ₹{(
                  Number(form.marketing_count) * RATES.marketing +
                  Number(form.utility_count) * RATES.utility +
                  Number(form.auth_count) * RATES.auth +
                  Number(form.service_count) * RATES.service
                ).toFixed(2)}
              </p>
            </div>
            <Button
              className="w-full text-white"
              style={{ backgroundColor: '#F97316' }}
              disabled={saveMut.isPending || !form.workspace_id}
              onClick={() =>
                saveMut.mutate({
                  workspace_id: form.workspace_id,
                  marketing_count: Number(form.marketing_count),
                  utility_count: Number(form.utility_count),
                  auth_count: Number(form.auth_count),
                  service_count: Number(form.service_count),
                })
              }
            >
              {saveMut.isPending ? 'Saving...' : 'Save Usage Data'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { RefreshCw, Plus, ChevronRight, CheckCircle2, CreditCard, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  admin_paid: boolean;
  admin_paid_at: string | null;
  payment_method: string | null;
  workspaces: { name: string; is_active: boolean; subscription_status: string } | null;
}

export function MetaBillingOverview() {
  const router    = useRouter();
  const qc        = useQueryClient();
  const [addOpen,   setAddOpen]   = useState(false);
  const [payOpen,   setPayOpen]   = useState(false);
  const [payMethod, setPayMethod] = useState('card');
  const [payNote,   setPayNote]   = useState('');
  const [syncing,   setSyncing]   = useState(false);
  const [paying,    setPaying]    = useState(false);
  const [form, setForm] = useState({ workspace_id: '', marketing_count: '0', utility_count: '0', auth_count: '0', service_count: '0' });

  const { data, isLoading, refetch } = useQuery<{ snapshots: Snapshot[] }>({
    queryKey: ['meta-billing'],
    queryFn:  () => fetch('/api/admin/meta-billing').then(r => r.json()),
  });

  const snapshots  = data?.snapshots ?? [];
  const totalInr   = snapshots.reduce((a, s) => a + (s.total_inr ?? 0), 0);
  const paidCount  = snapshots.filter(s => s.admin_paid).length;
  const unpaidTotal = snapshots.filter(s => !s.admin_paid).reduce((a, s) => a + (s.total_inr ?? 0), 0);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      await fetch('/api/admin/meta-billing?sync=1');
      await refetch();
      toast.success('Synced from Meta API!');
    } catch { toast.error('Sync failed'); }
    finally { setSyncing(false); }
  };

  // Mark ALL unpaid as paid
  const handlePayAll = async () => {
    setPaying(true);
    try {
      const res = await fetch('/api/admin/meta-billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pay_all: true, payment_method: payMethod, payment_note: payNote }),
      });
      const d = await res.json() as { updated?: number; error?: string };
      if (!res.ok || d.error) { toast.error(d.error ?? 'Failed'); return; }
      toast.success(`Marked ${d.updated} client(s) as paid via ${payMethod}`);
      setPayOpen(false);
      setPayNote('');
      await refetch();
    } catch { toast.error('Failed'); }
    finally { setPaying(false); }
  };

  const saveMut = useMutation({
    mutationFn: (body: object) =>
      fetch('/api/admin/meta-billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['meta-billing'] }); setAddOpen(false); },
    onError:   () => toast.error('Failed to save'),
  });

  return (
    <div className="space-y-4">

      {/* Summary cards row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500">Total Meta Spend</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">₹{totalInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-400 mt-1">{snapshots.length} WABAs tracked this month</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500">Pending Payment to Meta</p>
          <p className="text-2xl font-bold text-red-600 mt-1">₹{unpaidTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-400 mt-1">{snapshots.length - paidCount} clients unpaid</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500">Paid to Meta</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{paidCount}/{snapshots.length}</p>
          <p className="text-xs text-gray-400 mt-1">clients marked paid this month</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={syncing} onClick={handleSyncAll}>
          <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
          {syncing ? 'Syncing from Meta...' : 'Sync All WABAs'}
        </Button>
        <Button size="sm" className="gap-1.5 text-xs text-white" style={{ backgroundColor: '#16A34A' }}
          onClick={() => setPayOpen(true)} disabled={snapshots.length === 0}>
          <CreditCard className="h-3.5 w-3.5" /> Mark All Paid to Meta
        </Button>
        <Button size="sm" className="gap-1.5 text-xs text-white" style={{ backgroundColor: '#F97316' }}
          onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Usage Manually
        </Button>
        <p className="text-xs text-gray-400 ml-auto">
          Payment method: add Agentix&apos;s card to each WABA in Meta Business Manager → Meta auto-charges
        </p>
      </div>

      {/* Clients table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Client</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Marketing</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Utility</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Service</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Total</th>
              <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && snapshots.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-sm text-gray-400 py-12">
                  No billing data yet — click &quot;Sync All WABAs&quot; to fetch from Meta, or &quot;Add Usage Manually&quot;.
                </td>
              </tr>
            )}
            {snapshots.map(s => (
              <tr key={s.id}
                className="border-b border-gray-50 hover:bg-orange-50/20 cursor-pointer transition-colors"
                onClick={() => router.push(`/admin/meta-billing/${s.workspace_id}`)}>
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
                <td className="px-4 py-3 text-center">
                  {s.admin_paid
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" /> Paid ({s.payment_method ?? 'card'})
                      </span>
                    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        <IndianRupee className="h-3 w-3" /> Pending
                      </span>
                  }
                </td>
                <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mark All Paid dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" /> Mark All Clients Paid to Meta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm text-emerald-700">
              This records that Agentix has paid Meta for ALL {snapshots.length} clients this month.
              Total: <strong>₹{totalInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Payment Method Used</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">Credit / Debit Card</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank">Bank Transfer / NEFT</SelectItem>
                  <SelectItem value="auto">Meta Auto-Charged (Card on file)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Note (optional)</Label>
              <Input value={payNote} onChange={e => setPayNote(e.target.value)}
                placeholder="e.g. Meta charged card ending 4204 on July 1" className="mt-1" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 text-xs" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button className="flex-1 text-xs text-white gap-1.5" style={{ backgroundColor: '#16A34A' }}
                disabled={paying} onClick={handlePayAll}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {paying ? 'Marking...' : 'Confirm — Mark All Paid'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Usage Manually dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Meta Usage Manually</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs">Workspace ID</Label>
              <Input value={form.workspace_id} onChange={e => setForm(f => ({ ...f, workspace_id: e.target.value }))} placeholder="uuid..." className="mt-1" />
            </div>
            {(['marketing_count', 'utility_count', 'auth_count', 'service_count'] as const).map(k => (
              <div key={k}>
                <Label className="text-xs capitalize">{k.replace('_count', '')} Conversations</Label>
                <Input type="number" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className="mt-1" />
              </div>
            ))}
            <div className="bg-orange-50 rounded-xl p-3 text-sm">
              <p className="font-semibold text-orange-800">Estimated Charge</p>
              <p className="text-orange-700 text-lg font-bold mt-1">
                ₹{(Number(form.marketing_count)*RATES.marketing + Number(form.utility_count)*RATES.utility + Number(form.auth_count)*RATES.auth + Number(form.service_count)*RATES.service).toFixed(2)}
              </p>
            </div>
            <Button className="w-full text-white" style={{ backgroundColor: '#F97316' }}
              disabled={saveMut.isPending || !form.workspace_id}
              onClick={() => saveMut.mutate({ workspace_id: form.workspace_id, marketing_count: Number(form.marketing_count), utility_count: Number(form.utility_count), auth_count: Number(form.auth_count), service_count: Number(form.service_count) })}>
              {saveMut.isPending ? 'Saving...' : 'Save Usage Data'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  IndianRupee, Users, Camera, AlertTriangle,
  CheckCircle2, ShieldAlert, Settings2, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { rupees } from '@/lib/billing';

interface PaymentHistoryRow {
  id: string;
  invoice_no: string | null;
  total_paise: number;
  status: string;
  method: string | null;
  created_at: string;
  paid_at: string | null;
  workspace_id: string;
  workspace_name: string;
}
interface OverdueRow {
  subscription_id: string;
  workspace_id: string;
  workspace_name: string;
  plan_key: string;
  grace_until: string | null;
  current_period_end: string | null;
}
interface FailedPaymentRow {
  id: string;
  invoice_no: string | null;
  total_paise: number;
  workspace_id: string;
  workspace_name: string;
  created_at: string;
}
interface TermMix {
  monthly: number;
  quarterly: number;
  half_yearly: number;
  yearly: number;
}
interface BillingOverviewResponse {
  mrr: { INR: number };
  term_mix: TermMix;
  status_counts: Record<string, number>;
  instagram_addon: { active_count: number; addon_paise: number; revenue_paise: number };
  comped_active_count: number;
  total_captured: { INR: number };
  payment_history: PaymentHistoryRow[];
  overdue: OverdueRow[];
  failed_payments: FailedPaymentRow[];
  reconciliation_mismatches: number;
  config: { grace_days: number; reminder_days_before: number };
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  past_due: 'bg-amber-50 text-amber-700',
  suspended: 'bg-red-50 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
  pending: 'bg-blue-50 text-blue-700',
};

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  captured: 'bg-emerald-50 text-emerald-700',
  created: 'bg-blue-50 text-blue-700',
  failed: 'bg-red-50 text-red-600',
  refunded: 'bg-gray-100 text-gray-500',
};

function formatDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function BillingOverview() {
  const router = useRouter();
  const qc = useQueryClient();
  const [graceDays, setGraceDays] = useState('');
  const [reminderDays, setReminderDays] = useState('');
  const [seeded, setSeeded] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<BillingOverviewResponse>({
    queryKey: ['admin', 'billing'],
    queryFn: () => fetch('/api/admin/billing').then((r) => {
      if (!r.ok) throw new Error('Failed to load billing overview');
      return r.json();
    }),
  });

  useEffect(() => {
    if (data && !seeded) {
      setGraceDays(String(data.config.grace_days));
      setReminderDays(String(data.config.reminder_days_before));
      setSeeded(true);
    }
  }, [data, seeded]);

  const configMut = useMutation({
    mutationFn: (body: { grace_days: number; reminder_days_before: number }) =>
      fetch('/api/admin/billing/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error ?? 'Failed to save');
        return d;
      }),
    onSuccess: () => {
      toast.success('Billing config updated');
      qc.invalidateQueries({ queryKey: ['admin', 'billing'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
        <span>Could not load billing overview.</span>
        <button type="button" onClick={() => void refetch()} className="underline font-medium">Retry</button>
      </div>
    );
  }

  const sc = data?.status_counts ?? {};
  const mrr = data?.mrr.INR ?? 0;
  const termMix = data?.term_mix ?? { monthly: 0, quarterly: 0, half_yearly: 0, yearly: 0 };

  const kpiCards = [
    { label: 'MRR (monthly-equivalent)', value: `₹${rupees(mrr)}`, sub: `${sc.active ?? 0} active subscriptions`, icon: IndianRupee, color: 'bg-[#F97316]' },
    { label: 'Instagram Add-on Revenue', value: `₹${rupees(data?.instagram_addon.revenue_paise ?? 0)}`, sub: `${data?.instagram_addon.active_count ?? 0} clients on the bundle`, icon: Camera, color: 'bg-violet-500' },
    { label: 'Lifetime Captured Revenue', value: `₹${rupees(data?.total_captured.INR ?? 0)}`, sub: 'All-time captured payments', icon: CheckCircle2, color: 'bg-emerald-500' },
    { label: 'Past Due', value: String(sc.past_due ?? 0), sub: `${sc.suspended ?? 0} suspended`, icon: AlertTriangle, color: (sc.past_due ?? 0) > 0 ? 'bg-amber-500' : 'bg-gray-400' },
    { label: 'Comped Accounts', value: String(data?.comped_active_count ?? 0), sub: 'Active, not billed', icon: Users, color: 'bg-blue-500' },
    { label: 'Reconciliation', value: String(data?.reconciliation_mismatches ?? 0), sub: (data?.reconciliation_mismatches ?? 0) > 0 ? 'Status drift vs webhooks' : 'All in sync', icon: ShieldAlert, color: (data?.reconciliation_mismatches ?? 0) > 0 ? 'bg-red-500' : 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-5">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpiCards.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4 ${color}`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            {isLoading ? <Skeleton className="h-8 w-24 mb-1" /> : (
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
            )}
            <p className="text-sm font-semibold text-gray-700 mt-1">{label}</p>
            <p className="text-xs mt-0.5 text-gray-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Status counts strip */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Subscriptions by Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(['active', 'past_due', 'suspended', 'cancelled', 'pending'] as const).map((status) => (
            <div key={status} className="rounded-xl border border-gray-100 p-3 text-center">
              <p className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[status]}`}>
                {status.replace('_', ' ')}
              </p>
              <p className="text-xl font-bold text-gray-900 mt-2">{isLoading ? <Skeleton className="h-6 w-10 mx-auto" /> : (sc[status] ?? 0)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Term mix — active subscriptions by plan duration */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Active Subscriptions by Term</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['half_yearly', '6 Months'], ['yearly', '1 Year']] as const).map(([key, label]) => (
            <div key={key} className="rounded-xl border border-gray-100 p-3 text-center">
              <p className="text-xs font-semibold text-gray-500">{label}</p>
              <p className="text-xl font-bold text-gray-900 mt-2">{isLoading ? <Skeleton className="h-6 w-10 mx-auto" /> : (termMix[key] ?? 0)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Grace / reminder config */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">Grace &amp; Reminder Settings</h3>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs text-gray-500">Grace days (past_due → suspended)</Label>
            <Input type="number" min={1} value={graceDays} onChange={(e) => setGraceDays(e.target.value)} className="mt-1 w-40" />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Reminder days before renewal</Label>
            <Input type="number" min={1} value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className="mt-1 w-40" />
          </div>
          <Button
            size="sm"
            className="text-white text-xs"
            style={{ backgroundColor: '#F97316' }}
            disabled={configMut.isPending || !graceDays || !reminderDays}
            onClick={() => configMut.mutate({ grace_days: Number(graceDays), reminder_days_before: Number(reminderDays) })}
          >
            {configMut.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      {/* Overdue list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Overdue Subscriptions</h3>
            <p className="text-xs text-gray-400 mt-0.5">Past due — will auto-suspend after grace period</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Period End</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Grace Until</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 2 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && (data?.overdue.length ?? 0) === 0 && (
              <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-10">No overdue subscriptions</td></tr>
            )}
            {data?.overdue.map((o) => (
              <tr key={o.subscription_id} className="border-b border-gray-50 hover:bg-orange-50/20 cursor-pointer transition-colors"
                onClick={() => router.push(`/admin/clients/${o.workspace_id}`)}>
                <td className="px-5 py-3 font-medium text-gray-800">{o.workspace_name}</td>
                <td className="px-4 py-3 text-gray-600 capitalize">{o.plan_key.replace('_', ' + ')}</td>
                <td className="px-4 py-3 text-center text-gray-500">{formatDate(o.current_period_end)}</td>
                <td className="px-4 py-3 text-center font-semibold text-amber-600">{formatDate(o.grace_until)}</td>
                <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Failed payments */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Recent Failed Payments</h3>
            <p className="text-xs text-gray-400 mt-0.5">Last {data?.failed_payments.length ?? 0} failed attempts</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && (data?.failed_payments.length ?? 0) === 0 && (
              <tr><td colSpan={4} className="text-center text-sm text-gray-400 py-10">No failed payments</td></tr>
            )}
            {data?.failed_payments.map((p) => (
              <tr key={p.id} className="border-b border-gray-50">
                <td className="px-5 py-3 font-medium text-gray-800">{p.workspace_name}</td>
                <td className="px-4 py-3 text-gray-500">{p.invoice_no ?? '—'}</td>
                <td className="px-4 py-3 text-right font-semibold text-red-600">₹{rupees(p.total_paise)}</td>
                <td className="px-4 py-3 text-center text-gray-500">{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Payment History</h3>
            <p className="text-xs text-gray-400 mt-0.5">Most recent {data?.payment_history.length ?? 0} payments across all clients</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Method</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && (data?.payment_history.length ?? 0) === 0 && (
              <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-10">No payments recorded yet</td></tr>
            )}
            {data?.payment_history.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-orange-50/20 cursor-pointer transition-colors"
                onClick={() => router.push(`/admin/clients/${p.workspace_id}`)}>
                <td className="px-5 py-3 font-medium text-gray-800">{p.workspace_name}</td>
                <td className="px-4 py-3 text-gray-500">{p.invoice_no ?? '—'}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">₹{rupees(p.total_paise)}</td>
                <td className="px-4 py-3 text-center text-gray-500 capitalize">{p.method ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PAYMENT_STATUS_BADGE[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-gray-500">{formatDate(p.paid_at ?? p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

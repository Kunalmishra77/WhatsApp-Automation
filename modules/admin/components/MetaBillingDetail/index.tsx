'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, AlertCircle, RefreshCw, Pencil, Save, X, Send, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const RATES = { marketing: 0.58, utility: 0.14, auth: 0.14, service: 0.29 };

interface BillingSnapshot {
  id: string;
  month: string;
  marketing_count: number;
  utility_count: number;
  auth_count: number;
  service_count: number;
  total_inr: number;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  waba_id: string;
  phone_number_id: string;
  is_active: boolean;
  subscription_status: string;
  plan: string;
}

interface PhoneStatus {
  quality_rating?: string;
  status?: string;
  display_phone_number?: string;
}

interface DetailData {
  workspace: WorkspaceInfo;
  snapshots: BillingSnapshot[];
  phoneStatus: PhoneStatus | null;
}

export function MetaBillingDetail({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [syncing,      setSyncing]      = useState(false);
  const [manualMode,   setManualMode]   = useState(false);
  const [form,         setForm]         = useState({ marketing: '0', utility: '0', auth: '0', service: '0' });
  const [saving,       setSaving]       = useState(false);
  const [sendingInv,   setSendingInv]   = useState(false);
  const [paymentMode,  setPaymentMode]  = useState(false);
  const [paymentNote,  setPaymentNote]  = useState('');

  const { data, isLoading } = useQuery<DetailData>({
    queryKey: ['meta-billing', workspaceId],
    queryFn: () => fetch(`/api/admin/meta-billing/${workspaceId}`).then(r => r.json()),
  });

  const { workspace, snapshots, phoneStatus } = data ?? {};
  const latest = snapshots?.[0];

  // Sync from Meta API automatically
  const handleAutoSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/meta-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      const d = await res.json() as { success?: boolean; total_inr?: number; from_meta_api?: boolean; error?: string };
      if (!res.ok || d.error) {
        toast.error(d.error ?? 'Sync failed');
        setManualMode(true); // fall back to manual entry
      } else if (d.from_meta_api) {
        toast.success(`Synced from Meta! Total: ₹${d.total_inr}`);
        qc.invalidateQueries({ queryKey: ['meta-billing', workspaceId] });
      } else {
        toast.info('Meta API returned 0 data — please enter counts manually below');
        setManualMode(true);
        // Pre-fill form with existing data if available
        if (latest) {
          setForm({
            marketing: String(latest.marketing_count),
            utility:   String(latest.utility_count),
            auth:      String(latest.auth_count),
            service:   String(latest.service_count),
          });
        }
      }
    } catch {
      toast.error('Sync failed — try manual entry');
      setManualMode(true);
    } finally {
      setSyncing(false);
    }
  };

  // Send invoice via WhatsApp to client's owner phone
  const handleSendInvoice = async () => {
    setSendingInv(true);
    try {
      const res = await fetch('/api/admin/meta-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id:    workspaceId,
          marketing_count: latest?.marketing_count ?? 0,
          utility_count:   latest?.utility_count   ?? 0,
          auth_count:      latest?.auth_count      ?? 0,
          service_count:   latest?.service_count   ?? 0,
          send_invoice:    true,
        }),
      });
      const d = await res.json() as { invoice_sent?: boolean; error?: string };
      if (d.invoice_sent) toast.success('Invoice sent via WhatsApp to client!');
      else toast.error(d.error ?? 'Could not send invoice — check owner phone number');
    } catch { toast.error('Send failed'); }
    finally { setSendingInv(false); }
  };

  // Save manual entry
  const handleManualSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/meta-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id:    workspaceId,
          marketing_count: Number(form.marketing),
          utility_count:   Number(form.utility),
          auth_count:      Number(form.auth),
          service_count:   Number(form.service),
        }),
      });
      const d = await res.json() as { success?: boolean; total_inr?: number; error?: string };
      if (!res.ok || d.error) {
        toast.error(d.error ?? 'Save failed');
      } else {
        toast.success(`Saved! Total: ₹${d.total_inr}`);
        setManualMode(false);
        qc.invalidateQueries({ queryKey: ['meta-billing', workspaceId] });
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const estimated = +(
    Number(form.marketing) * RATES.marketing +
    Number(form.utility)   * RATES.utility +
    Number(form.auth)      * RATES.auth +
    Number(form.service)   * RATES.service
  ).toFixed(2);

  const rows = [
    { label: 'Marketing', count: latest?.marketing_count ?? 0, rate: RATES.marketing, color: 'bg-purple-100 text-purple-700' },
    { label: 'Utility',   count: latest?.utility_count   ?? 0, rate: RATES.utility,   color: 'bg-blue-100 text-blue-700' },
    { label: 'Auth',      count: latest?.auth_count      ?? 0, rate: RATES.auth,      color: 'bg-green-100 text-green-700' },
    { label: 'Service',   count: latest?.service_count   ?? 0, rate: RATES.service,   color: 'bg-amber-100 text-amber-700' },
  ];

  if (isLoading) return <div className="bg-white rounded-2xl p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="space-y-4">
      <Link href="/admin/meta-billing" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to all WABAs
      </Link>

      {/* Workspace info + sync buttons */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center text-lg font-bold text-orange-500 shrink-0">
            {workspace?.name?.[0]?.toUpperCase() ?? 'W'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{workspace?.name}</h2>
            <p className="text-sm text-gray-400">WABA: {workspace?.waba_id ?? '—'} · Phone: {phoneStatus?.display_phone_number ?? workspace?.phone_number_id ?? '—'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {phoneStatus?.quality_rating === 'GREEN' ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5" /> GREEN
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                <AlertCircle className="h-3.5 w-3.5" /> {phoneStatus?.quality_rating ?? 'Unknown'}
              </span>
            )}
            {/* Auto sync from Meta API */}
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" disabled={syncing} onClick={handleAutoSync}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Meta'}
            </Button>
            {/* Send Invoice via WhatsApp */}
            {latest && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 border-green-200 text-green-700 hover:bg-green-50"
                disabled={sendingInv} onClick={handleSendInvoice}>
                <Send className={`h-3.5 w-3.5 ${sendingInv ? 'animate-pulse' : ''}`} />
                {sendingInv ? 'Sending...' : 'Send Invoice'}
              </Button>
            )}
            {/* Record payment received */}
            {latest && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => setPaymentMode(p => !p)}>
                <IndianRupee className="h-3.5 w-3.5" />
                Payment Received
              </Button>
            )}
            {/* Manual entry toggle */}
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
              onClick={() => {
                setManualMode(m => !m);
                if (!manualMode && latest) {
                  setForm({
                    marketing: String(latest.marketing_count),
                    utility:   String(latest.utility_count),
                    auth:      String(latest.auth_count),
                    service:   String(latest.service_count),
                  });
                }
              }}>
              <Pencil className="h-3.5 w-3.5" />
              {manualMode ? 'Cancel Manual' : 'Enter Manually'}
            </Button>
          </div>
        </div>

        {/* Payment Received panel */}
        {paymentMode && latest && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <IndianRupee className="h-3.5 w-3.5 text-blue-500" />
              Record Payment Received — ₹{(latest.total_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} outstanding
            </p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 mb-3">
              ✓ Mark when client has transferred the Meta billing amount to Agentix. This is a manual record only.
            </div>
            <div>
              <Label className="text-xs text-gray-500">Note (optional — transaction ID, date, method)</Label>
              <Input value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                placeholder="e.g. UPI txn 123456 received on 1 July" className="mt-1 h-8 text-sm" />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPaymentMode(false)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" className="h-8 text-xs text-white gap-1.5" style={{ backgroundColor: '#2563EB' }}
                onClick={() => {
                  toast.success(`Payment of ₹${latest.total_inr} recorded for ${workspace?.name}`);
                  setPaymentMode(false);
                  setPaymentNote('');
                }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Payment Received
              </Button>
            </div>
          </div>
        )}

        {/* Manual entry form */}
        {manualMode && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-3">
              Enter conversation counts manually from Meta Business Manager → WhatsApp Manager → Insights → Conversations
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['marketing', 'utility', 'auth', 'service'] as const).map(key => (
                <div key={key}>
                  <Label className="text-xs text-gray-500 capitalize">{key} convos</Label>
                  <Input
                    type="number" min="0"
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <p className="text-sm font-semibold text-gray-700">
                Estimated: <span style={{ color: '#F97316' }}>₹{estimated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setManualMode(false)}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
                <Button size="sm" className="h-8 text-xs gap-1 text-white" style={{ backgroundColor: '#F97316' }}
                  disabled={saving} onClick={handleManualSave}>
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Billing breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Conversation Breakdown —{' '}
          {latest?.month
            ? new Date(latest.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
            : 'This Month'}
          {!latest && (
            <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              No data yet — click Sync or Enter Manually
            </span>
          )}
        </h3>
        <div className="space-y-3">
          {rows.map(({ label, count, rate, color }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
                <span className="text-sm text-gray-600">{count.toLocaleString()} convos</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-800">₹{(count * rate).toFixed(2)}</p>
                <p className="text-xs text-gray-400">@ ₹{rate}/conv</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 mt-2 border-t-2 border-gray-100">
            <span className="text-sm font-bold text-gray-900">Total This Month</span>
            <span className="text-xl font-bold" style={{ color: '#F97316' }}>
              ₹{(latest?.total_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* History */}
      {snapshots && snapshots.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">History (Last 6 Months)</h3>
          <div className="space-y-2">
            {snapshots.slice(1).map(s => (
              <div key={s.id} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-500">
                  {new Date(s.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </span>
                <span className="font-semibold text-gray-800">₹{(s.total_inr ?? 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

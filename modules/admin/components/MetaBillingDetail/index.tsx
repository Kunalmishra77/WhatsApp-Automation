'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, AlertCircle, RefreshCw,
  Send, IndianRupee, ExternalLink, Info, CreditCard,
  X, Save, Pencil, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const RATES = { marketing: 0.58, utility: 0.14, auth: 0.14, service: 0.29 };

interface BillingSnapshot {
  id: string;
  month: string;
  marketing_count: number;
  utility_count: number;
  auth_count: number;
  service_count: number;
  total_inr: number;
  admin_paid: boolean;
  admin_paid_at: string | null;
  payment_method: string | null;
  payment_note: string | null;
}

interface WorkspaceInfo {
  id: string; name: string; waba_id: string;
  phone_number_id: string; is_active: boolean;
  subscription_status: string; plan: string;
}

interface PhoneStatus {
  quality_rating?: string; status?: string; display_phone_number?: string;
}

interface DetailData {
  workspace: WorkspaceInfo;
  snapshots: BillingSnapshot[];
  phoneStatus: PhoneStatus | null;
}

export function MetaBillingDetail({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [syncing,     setSyncing]     = useState(false);
  const [manualMode,  setManualMode]  = useState(false);
  const [form,        setForm]        = useState({ marketing: '0', utility: '0', auth: '0', service: '0' });
  const [saving,      setSaving]      = useState(false);
  const [sendingInv,  setSendingInv]  = useState(false);
  const [payMethod,   setPayMethod]   = useState('auto');
  const [payNote,     setPayNote]     = useState('');
  const [payMode,     setPayMode]     = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);

  const { data, isLoading } = useQuery<DetailData>({
    queryKey: ['meta-billing', workspaceId],
    queryFn: () => fetch(`/api/admin/meta-billing/${workspaceId}`).then(r => r.json()),
    staleTime: 30_000,
  });

  const { workspace, snapshots, phoneStatus } = data ?? {};
  const latest = snapshots?.[0];

  // Try to fetch actual data from Meta API
  const handleSyncFromMeta = async () => {
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
      } else if (d.from_meta_api) {
        toast.success(`Synced from Meta API! Total: ₹${d.total_inr}`);
        qc.invalidateQueries({ queryKey: ['meta-billing', workspaceId] });
      } else {
        toast.info('Meta API data not available — showing estimate from campaign data');
        qc.invalidateQueries({ queryKey: ['meta-billing', workspaceId] });
      }
    } catch { toast.error('Sync failed'); }
    finally { setSyncing(false); }
  };

  // Mark that Meta has auto-charged Agentix's card
  const handleMarkPaid = async () => {
    setMarkingPaid(true);
    try {
      const res = await fetch('/api/admin/meta-billing', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, payment_method: payMethod, payment_note: payNote }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (d.success) {
        toast.success(`Recorded — Meta has charged Agentix's card for ${workspace?.name}`);
        setPayMode(false); setPayNote('');
        qc.invalidateQueries({ queryKey: ['meta-billing', workspaceId] });
      } else toast.error(d.error ?? 'Failed');
    } catch { toast.error('Failed'); }
    finally { setMarkingPaid(false); }
  };

  // Send billing invoice to client via WhatsApp
  const handleSendInvoice = async () => {
    setSendingInv(true);
    try {
      const res = await fetch('/api/admin/meta-billing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          marketing_count: latest?.marketing_count ?? 0,
          utility_count:   latest?.utility_count   ?? 0,
          auth_count:      latest?.auth_count      ?? 0,
          service_count:   latest?.service_count   ?? 0,
          send_invoice: true,
        }),
      });
      const d = await res.json() as { invoice_sent?: boolean; invoice_method?: string; error?: string };
      if (d.invoice_sent) {
        const via = d.invoice_method === 'email+whatsapp' ? 'Email + WhatsApp' : d.invoice_method === 'email' ? 'Email' : 'WhatsApp';
        toast.success(`Bill sent to client via ${via}!`);
      } else toast.error(d.error ?? 'Could not send — check owner email/phone in client settings');
    } catch { toast.error('Send failed'); }
    finally { setSendingInv(false); }
  };

  // Save manual counts
  const handleManualSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/meta-billing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id:    workspaceId,
          marketing_count: Number(form.marketing),
          utility_count:   Number(form.utility),
          auth_count:      Number(form.auth),
          service_count:   Number(form.service),
        }),
      });
      const d = await res.json() as { success?: boolean; total_inr?: number; error?: string };
      if (!res.ok || d.error) toast.error(d.error ?? 'Save failed');
      else {
        toast.success(`Saved! Total: ₹${d.total_inr}`);
        setManualMode(false);
        qc.invalidateQueries({ queryKey: ['meta-billing', workspaceId] });
      }
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const estimated = +(
    Number(form.marketing) * RATES.marketing + Number(form.utility) * RATES.utility +
    Number(form.auth) * RATES.auth + Number(form.service) * RATES.service
  ).toFixed(2);

  const rows = [
    { label: 'Marketing', count: latest?.marketing_count ?? 0, rate: RATES.marketing, color: 'bg-purple-100 text-purple-700' },
    { label: 'Utility',   count: latest?.utility_count   ?? 0, rate: RATES.utility,   color: 'bg-blue-100 text-blue-700' },
    { label: 'Auth',      count: latest?.auth_count      ?? 0, rate: RATES.auth,      color: 'bg-green-100 text-green-700' },
    { label: 'Service',   count: latest?.service_count   ?? 0, rate: RATES.service,   color: 'bg-amber-100 text-amber-700' },
  ];

  const metaBillingUrl = workspace?.waba_id
    ? `https://business.facebook.com/latest/whatsapp_manager/billing/?asset_id=${workspace.waba_id}`
    : 'https://business.facebook.com/latest/whatsapp_manager/billing/';

  if (isLoading) return <div className="bg-white rounded-2xl p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="space-y-4">
      <Link href="/admin/meta-billing" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 w-fit">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to all WABAs
      </Link>

      {/* HOW IT WORKS explanation */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 space-y-1.5">
            <p className="font-semibold text-blue-800 text-sm">How Meta Billing Works (No Manual Payment Needed)</p>
            <p>✅ <strong>Agentix's ONE card</strong> is already added to each client's WABA in Meta BM — Meta automatically charges it every month. No going to each developer page.</p>
            <p>📊 Below shows an <strong>estimate from campaign data</strong>. Click "Exact Bill on Meta" to see the real charge on Meta.</p>
            <p>📧 After Meta charges Agentix → Click <strong>"Send Bill to Client"</strong> → Client gets invoice on Email + WhatsApp → They transfer money to Agentix.</p>
          </div>
        </div>
      </div>

      {/* Workspace header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center text-lg font-bold text-orange-500 shrink-0">
            {workspace?.name?.[0]?.toUpperCase() ?? 'W'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{workspace?.name}</h2>
            <p className="text-sm text-gray-400">
              WABA: {workspace?.waba_id ?? '—'} · Phone: {phoneStatus?.display_phone_number ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quality badge */}
            {phoneStatus?.quality_rating === 'GREEN'
              ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full"><CheckCircle2 className="h-3.5 w-3.5" /> GREEN</span>
              : <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full"><AlertCircle className="h-3.5 w-3.5" /> {phoneStatus?.quality_rating ?? 'Unknown'}</span>
            }
            {/* View exact bill on Meta BM */}
            <a href={metaBillingUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 border-blue-200 text-blue-700 hover:bg-blue-50">
                <ExternalLink className="h-3.5 w-3.5" /> Exact Bill on Meta
              </Button>
            </a>
            {/* Sync from Meta API */}
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" disabled={syncing} onClick={handleSyncFromMeta}>
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
              {syncing ? 'Syncing...' : 'Sync from Meta'}
            </Button>
            {/* Edit manually */}
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
              onClick={() => {
                setManualMode(m => !m);
                if (!manualMode && latest) {
                  setForm({ marketing: String(latest.marketing_count), utility: String(latest.utility_count), auth: String(latest.auth_count), service: String(latest.service_count) });
                }
              }}>
              <Pencil className="h-3.5 w-3.5" /> {manualMode ? 'Cancel' : 'Edit Counts'}
            </Button>
          </div>
        </div>

        {/* Manual edit form */}
        {manualMode && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Info className="h-3.5 w-3.5" />
              Get exact counts from: <strong>Meta Business Manager → WhatsApp Manager → Account Tools → Insights → Conversations</strong>
            </p>
            <a href={metaBillingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline mb-3 inline-block">
              Open Meta Billing Page →
            </a>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
              {(['marketing', 'utility', 'auth', 'service'] as const).map(key => (
                <div key={key}>
                  <Label className="text-xs text-gray-500 capitalize">{key} conversations</Label>
                  <Input type="number" min="0" value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="mt-1 h-8 text-sm" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <p className="text-sm font-semibold text-gray-700">
                Total: <span style={{ color: '#F97316' }}>₹{estimated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setManualMode(false)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
                <Button size="sm" className="h-8 text-xs text-white gap-1" style={{ backgroundColor: '#F97316' }}
                  disabled={saving} onClick={handleManualSave}>
                  <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Billing breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Conversation Breakdown —{' '}
              {latest?.month ? new Date(latest.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'This Month'}
            </h3>
            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Estimated from campaign data — verify with Meta BM for exact billing
            </p>
          </div>
          {latest?.admin_paid
            ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5" /> Paid to Meta ({latest.payment_method})
                {latest.admin_paid_at && <span className="text-emerald-600 font-normal ml-1">on {new Date(latest.admin_paid_at).toLocaleDateString('en-IN')}</span>}
              </span>
            : <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">
                <IndianRupee className="h-3.5 w-3.5" /> Pending payment to Meta
              </span>
          }
        </div>

        <div className="space-y-3">
          {rows.map(({ label, count, rate, color }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
                <span className="text-sm text-gray-600">{count.toLocaleString()} conversations</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-800">₹{(count * rate).toFixed(2)}</p>
                <p className="text-xs text-gray-400">@ ₹{rate}/conv</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-gray-100">
            <span className="text-sm font-bold text-gray-900">Estimated Total</span>
            <span className="text-2xl font-bold" style={{ color: '#F97316' }}>
              ₹{(latest?.total_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* PAYMENT ACTIONS */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Payment Actions</h3>
        <p className="text-xs text-gray-400 mb-4">
          Meta automatically charges Agentix&apos;s card on file. Record when it happens, then send the bill to the client.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Step 1: Record Meta charged Agentix */}
          <div className="border border-gray-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center font-bold">1</div>
              <p className="text-sm font-semibold text-gray-800">Meta Charged Agentix&apos;s Card</p>
            </div>
            <p className="text-xs text-gray-400 mb-3">Record when Meta auto-charges your card for this client&apos;s WABA usage.</p>
            {latest?.admin_paid
              ? <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg p-2">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Recorded on {latest.admin_paid_at ? new Date(latest.admin_paid_at).toLocaleDateString('en-IN') : '—'} via {latest.payment_method}
                </div>
              : <>
                  {!payMode && (
                    <Button size="sm" className="gap-1.5 text-xs w-full text-white" style={{ backgroundColor: '#16A34A' }}
                      onClick={() => setPayMode(true)} disabled={!latest}>
                      <CreditCard className="h-3.5 w-3.5" /> Record Meta Charged Card
                    </Button>
                  )}
                  {payMode && (
                    <div className="space-y-2">
                      <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                        className="h-8 w-full rounded-md border border-input text-xs px-2">
                        <option value="auto">Meta Auto-Charged (card on file)</option>
                        <option value="card">Manually paid via Card</option>
                        <option value="upi">Paid via UPI</option>
                        <option value="bank">Bank Transfer</option>
                      </select>
                      <Input value={payNote} onChange={e => setPayNote(e.target.value)}
                        placeholder="Note (e.g. charged on July 1)" className="h-8 text-xs" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setPayMode(false)}>Cancel</Button>
                        <Button size="sm" className="flex-1 h-8 text-xs text-white gap-1" style={{ backgroundColor: '#16A34A' }}
                          disabled={markingPaid} onClick={handleMarkPaid}>
                          <CheckCircle2 className="h-3 w-3" /> {markingPaid ? 'Saving...' : 'Confirm'}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
            }
          </div>

          {/* Step 2: Send bill to client */}
          <div className="border border-gray-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center font-bold">2</div>
              <p className="text-sm font-semibold text-gray-800">Bill the Client</p>
            </div>
            <p className="text-xs text-gray-400 mb-3">Send a WhatsApp message to client with their Meta API usage charges so they can reimburse Agentix.</p>
            <Button size="sm" className="gap-1.5 text-xs w-full text-white" style={{ backgroundColor: '#F97316' }}
              disabled={sendingInv || !latest} onClick={handleSendInvoice}>
              <Send className={cn('h-3.5 w-3.5', sendingInv && 'animate-pulse')} />
              {sendingInv ? 'Sending...' : `Send Bill (₹${(latest?.total_inr ?? 0).toFixed(0)}) to Client`}
            </Button>
            <p className="text-xs text-gray-400 mt-2 text-center">Sends via WhatsApp to client&apos;s owner phone</p>
          </div>
        </div>
      </div>

      {/* History */}
      {snapshots && snapshots.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Billing History</h3>
          <div className="space-y-2">
            {snapshots.slice(1).map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">
                  {new Date(s.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-800">₹{(s.total_inr ?? 0).toFixed(2)}</span>
                  {s.admin_paid
                    ? <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Paid</span>
                    : <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Pending</span>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

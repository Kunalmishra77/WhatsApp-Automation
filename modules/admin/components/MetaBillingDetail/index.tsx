'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

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
  const { data, isLoading } = useQuery<DetailData>({
    queryKey: ['meta-billing', workspaceId],
    queryFn: () => fetch(`/api/admin/meta-billing/${workspaceId}`).then(r => r.json()),
  });

  if (isLoading) return <div className="bg-white rounded-2xl p-8 text-center text-gray-400">Loading...</div>;

  const { workspace, snapshots, phoneStatus } = data ?? {};
  const latest = snapshots?.[0];

  const rows = [
    { label: 'Marketing', count: latest?.marketing_count ?? 0, rate: RATES.marketing, color: 'bg-purple-100 text-purple-700' },
    { label: 'Utility',   count: latest?.utility_count   ?? 0, rate: RATES.utility,   color: 'bg-blue-100 text-blue-700' },
    { label: 'Auth',      count: latest?.auth_count      ?? 0, rate: RATES.auth,      color: 'bg-green-100 text-green-700' },
    { label: 'Service',   count: latest?.service_count   ?? 0, rate: RATES.service,   color: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div className="space-y-4">
      <Link href="/admin/meta-billing" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to all WABAs
      </Link>

      {/* Workspace info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center text-lg font-bold text-orange-500">
            {workspace?.name?.[0]?.toUpperCase() ?? 'W'}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{workspace?.name}</h2>
            <p className="text-sm text-gray-400">WABA: {workspace?.waba_id ?? '—'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {phoneStatus?.quality_rating === 'GREEN' ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5" /> GREEN
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded-full">
                <AlertCircle className="h-3.5 w-3.5" /> {phoneStatus?.quality_rating ?? 'Unknown'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Billing breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Conversation Breakdown —{' '}
          {latest?.month
            ? new Date(latest.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
            : 'This Month'}
        </h3>
        <div className="space-y-3">
          {rows.map(({ label, count, rate, color }) => (
            <div
              key={label}
              className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
            >
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
              <div
                key={s.id}
                className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0"
              >
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

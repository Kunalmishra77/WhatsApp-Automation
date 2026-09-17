'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PieChart, RefreshCw, TrendingUp, Users, Wallet, Target } from 'lucide-react';
import { useRequirePageRole } from '@/hooks/useRequirePageRole';
import { useWorkspaceStore } from '@/store/workspace.store';

const CHANNEL_META: Record<string, { label: string; cls: string }> = {
  whatsapp:    { label: 'WhatsApp',        cls: 'bg-emerald-100 text-emerald-700' },
  instagram:   { label: 'Instagram',      cls: 'bg-purple-100 text-purple-700' },
  meta_ads:    { label: 'Meta Ads',       cls: 'bg-blue-100 text-blue-700' },
  google_ads:  { label: 'Google Ads',     cls: 'bg-red-100 text-red-700' },
  gbp:         { label: 'Google Business', cls: 'bg-cyan-100 text-cyan-700' },
  website:     { label: 'Website',        cls: 'bg-indigo-100 text-indigo-700' },
  chat_widget: { label: 'Chat Widget',    cls: 'bg-indigo-100 text-indigo-700' },
  campaign:    { label: 'Campaign',       cls: 'bg-amber-100 text-amber-700' },
  api:         { label: 'API',            cls: 'bg-slate-100 text-slate-700' },
  referral:    { label: 'Referral',       cls: 'bg-pink-100 text-pink-700' },
  manual:      { label: 'Manual',         cls: 'bg-gray-100 text-gray-600' },
  other:       { label: 'Other',          cls: 'bg-gray-100 text-gray-500' },
};
const chLabel = (c: string) => CHANNEL_META[c]?.label ?? c;
const chCls = (c: string) => CHANNEL_META[c]?.cls ?? CHANNEL_META.other!.cls;

type ChannelRoi = {
  channel: string; leads: number; conversions: number; conversion_rate: number;
  spend: number; cost_per_lead: number | null; spend_kind: 'ad' | 'messaging' | null;
};

export default function MarketingRoiPage() {
  useRequirePageRole('marketing-roi');
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = new URLSearchParams({ workspaceId: workspaceId ?? '' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['marketing-roi', workspaceId, from, to],
    queryFn: () => fetch(`/api/analytics/roi?${params}`).then((r) => r.json()),
    enabled: !!workspaceId,
    staleTime: 20_000,
  });

  const channels: ChannelRoi[] = data?.channels ?? [];
  const totals = data?.totals ?? { leads: 0, conversions: 0, spend: 0, ad_spend: 0, conversion_rate: 0, cost_per_lead: null };
  const currency: string = data?.currency ?? 'INR';
  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  const kpis = [
    { label: 'Total leads', value: totals.leads.toLocaleString('en-IN'), icon: Users, color: 'bg-brand-500' },
    { label: 'Conversions', value: `${totals.conversions.toLocaleString('en-IN')} · ${totals.conversion_rate}%`, icon: TrendingUp, color: 'bg-emerald-500' },
    { label: 'Ad spend', value: money(totals.ad_spend), icon: Wallet, color: 'bg-red-500' },
    { label: 'Cost / lead (ads)', value: totals.cost_per_lead != null ? money(totals.cost_per_lead) : '—', icon: Target, color: 'bg-amber-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PieChart className="h-6 w-6 text-brand-500" /> Marketing ROI
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Spend, leads and cost-per-lead across every channel — one view</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl mb-3 ${k.color}`}>
              <k.icon className="h-4 w-4 text-white" />
            </div>
            {isLoading ? <Skeleton className="h-7 w-20" /> : <p className="text-xl font-bold text-gray-900 tabular-nums">{k.value}</p>}
            <p className="text-sm font-medium text-gray-700 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 text-sm" />
          </div>
          {(from || to) && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setFrom(''); setTo(''); }}>Clear</Button>
          )}
        </div>
      </div>

      {/* Per-channel table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Channel</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Leads</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conv.</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conv %</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Spend</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost / lead</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 6 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))}
              {!isLoading && channels.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-sm text-gray-400">No data yet.</td></tr>
              )}
              {!isLoading && channels.map((c) => (
                <tr key={c.channel} className="border-b border-gray-50">
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${chCls(c.channel)}`}>{chLabel(c.channel)}</span>
                    {c.spend_kind === 'messaging' && <span className="ml-2 text-[10px] text-gray-400">(messaging cost)</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{c.leads.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{c.conversions.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{c.conversion_rate}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{c.spend > 0 ? money(c.spend) : '—'}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-gray-900">{c.cost_per_lead != null ? money(c.cost_per_lead) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 px-1">
        Ad spend is tracked for Google Ads. WhatsApp shows messaging cost. Cost-per-lead uses ad spend only.
        Currency: {currency}.
      </p>
    </div>
  );
}

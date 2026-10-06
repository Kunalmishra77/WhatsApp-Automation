'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PieChart, RefreshCw, TrendingUp, Wallet, Target } from 'lucide-react';
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
  revenue: number; roas: number | null; net_roi: number | null;
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

  const { data: adData } = useQuery({
    queryKey: ['ad-performance', workspaceId, from, to],
    queryFn: () => fetch(`/api/analytics/ad-performance?${params}`).then((r) => r.json()),
    enabled: !!workspaceId,
    staleTime: 20_000,
  });

  const channels: ChannelRoi[] = data?.channels ?? [];
  type AdRow = { ad_id: string; ad_name: string; ad_platform: string | null; leads: number; conversions: number; conversion_rate: number; revenue: number };
  const ads: AdRow[] = adData?.ads ?? [];
  const totals = data?.totals ?? { leads: 0, conversions: 0, spend: 0, ad_spend: 0, conversion_rate: 0, cost_per_lead: null, revenue: 0, roas: null, net_roi: null };
  const currency: string = data?.currency ?? 'INR';
  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const roasText = (r: number | null) => (r != null ? `${r.toFixed(2)}×` : '—');
  const roiText = (r: number | null) => (r != null ? `${r > 0 ? '+' : ''}${r}%` : '—');

  const kpis = [
    { label: 'Revenue', value: money(totals.revenue), icon: TrendingUp, color: 'bg-emerald-500' },
    { label: 'ROAS', value: roasText(totals.roas), icon: Target, color: 'bg-brand-500' },
    { label: 'Ad spend', value: money(totals.ad_spend), icon: Wallet, color: 'bg-red-500' },
    { label: 'Net ROI', value: roiText(totals.net_roi), icon: TrendingUp, color: 'bg-amber-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PieChart className="h-6 w-6 text-brand-500" /> Marketing ROI
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Spend, revenue, ROAS and true ROI across every channel — one view</p>
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
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Spend</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ROAS</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Net ROI</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))}
              {!isLoading && channels.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-16 text-center text-sm text-gray-400">No data yet.</td></tr>
              )}
              {!isLoading && channels.map((c) => (
                <tr key={c.channel} className="border-b border-gray-50">
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${chCls(c.channel)}`}>{chLabel(c.channel)}</span>
                    {c.spend_kind === 'messaging' && <span className="ml-2 text-[10px] text-gray-400">(messaging cost)</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{c.leads.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{c.conversions.toLocaleString('en-IN')} · {c.conversion_rate}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{c.spend > 0 ? money(c.spend) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{c.revenue > 0 ? money(c.revenue) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{roasText(c.roas)}</td>
                  <td className={`px-5 py-3 text-right tabular-nums font-medium ${c.net_roi == null ? 'text-gray-400' : c.net_roi >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{roiText(c.net_roi)}</td>
                </tr>
              ))}
              {!isLoading && channels.length > 0 && (
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-5 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{totals.leads.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{totals.conversions.toLocaleString('en-IN')} · {totals.conversion_rate}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{money(totals.spend)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{money(totals.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{roasText(totals.roas)}</td>
                  <td className={`px-5 py-3 text-right tabular-nums ${totals.net_roi == null ? 'text-gray-400' : totals.net_roi >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{roiText(totals.net_roi)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top performing ads (CTWA + Instagram ads) */}
      {ads.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Top performing ads</h2>
            <p className="text-xs text-gray-400 mt-0.5">Leads &amp; revenue by individual ad (Click-to-WhatsApp &amp; Instagram)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ad</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Leads</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conv.</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((a) => (
                  <tr key={a.ad_id} className="border-b border-gray-50">
                    <td className="px-5 py-3">
                      <span className="font-medium text-gray-900">{a.ad_name}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${a.ad_platform === 'instagram' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {a.ad_platform === 'instagram' ? 'Instagram' : 'Facebook'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{a.leads.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{a.conversions.toLocaleString('en-IN')} · {a.conversion_rate}%</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-gray-900">{a.revenue > 0 ? money(a.revenue) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 px-1">
        Revenue counts a converted lead&apos;s deal value, falling back to any linked order total. ROAS = revenue ÷ spend;
        Net ROI = (revenue − spend) ÷ spend. Ad spend covers Google &amp; Meta ads; WhatsApp shows messaging cost. Currency: {currency}.
      </p>
    </div>
  );
}

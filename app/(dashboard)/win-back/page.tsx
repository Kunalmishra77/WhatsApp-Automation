'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HeartHandshake, RefreshCw, Users, TrendingDown, Wallet } from 'lucide-react';
import { useRequirePageRole } from '@/hooks/useRequirePageRole';
import { useWorkspaceStore } from '@/store/workspace.store';

type Bucket = 'active' | 'at_risk' | 'churning' | 'lost';
interface WinBackRow { id: string; name: string | null; daysSince: number; value: number; orders: number; bucket: Bucket }

const BUCKET_META: Record<Bucket, { label: string; cls: string }> = {
  active:   { label: 'Active',   cls: 'border-emerald-200 text-emerald-700 bg-emerald-50' },
  at_risk:  { label: 'At Risk',  cls: 'border-amber-200 text-amber-700 bg-amber-50' },
  churning: { label: 'Churning', cls: 'border-orange-200 text-orange-700 bg-orange-50' },
  lost:     { label: 'Lost',     cls: 'border-red-200 text-red-700 bg-red-50' },
};

export default function WinBackPage() {
  useRequirePageRole('win-back');
  const router = useRouter();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['win-back', workspaceId],
    queryFn: () => fetch(`/api/analytics/win-back?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const buckets = data?.buckets ?? { active: { count: 0 }, at_risk: { count: 0 }, churning: { count: 0 }, lost: { count: 0 } };
  const totals = data?.totals ?? { customers: 0, lapsed: 0, atRiskRevenue: 0 };
  const list: WinBackRow[] = data?.winBack ?? [];
  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HeartHandshake className="h-6 w-6 text-brand-500" /> Win-Back
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Customers going quiet — re-engage your highest-value lapsed buyers</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total customers', value: totals.customers.toLocaleString('en-IN'), icon: Users, color: 'bg-brand-500' },
          { label: 'Lapsed (need win-back)', value: totals.lapsed.toLocaleString('en-IN'), icon: TrendingDown, color: 'bg-amber-500' },
          { label: 'Revenue at risk', value: money(totals.atRiskRevenue), icon: Wallet, color: 'bg-red-500' },
          { label: 'Active customers', value: (buckets.active.count ?? 0).toLocaleString('en-IN'), icon: HeartHandshake, color: 'bg-emerald-500' },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl mb-3 ${k.color}`}>
              <k.icon className="h-4 w-4 text-white" />
            </div>
            {isLoading ? <Skeleton className="h-7 w-16" /> : <p className="text-xl font-bold text-gray-900 tabular-nums">{k.value}</p>}
            <p className="text-sm font-medium text-gray-700 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Win-back list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Win-back list — highest value first</h2>
          <p className="text-xs text-gray-400">Send these customers a WhatsApp offer to bring them back.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last order</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Orders</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Lifetime value</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 5 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))}
              {!isLoading && list.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-sm text-gray-400">
                  No lapsed customers — everyone&apos;s active! (Or no order data yet.)
                </td></tr>
              )}
              {!isLoading && list.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-brand-50/20 cursor-pointer transition-colors"
                  onClick={() => router.push(`/contacts/${c.id}`)}>
                  <td className="px-5 py-3 font-medium text-gray-800">{c.name ?? 'Customer'}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className={`text-xs ${BUCKET_META[c.bucket].cls}`}>{BUCKET_META[c.bucket].label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{c.daysSince}d ago</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{c.orders}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">{money(c.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

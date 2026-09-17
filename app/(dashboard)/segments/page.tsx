'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Boxes, RefreshCw, Users } from 'lucide-react';
import { useRequirePageRole } from '@/hooks/useRequirePageRole';
import { useWorkspaceStore } from '@/store/workspace.store';

interface Segment { segment: string; label: string; tip: string; count: number; value: number; contacts: Array<{ id: string; name: string | null }> }

const SEG_COLOR: Record<string, string> = {
  champions: 'from-emerald-500 to-emerald-600',
  loyal: 'from-brand-500 to-brand-600',
  big_spenders: 'from-amber-500 to-amber-600',
  promising: 'from-sky-500 to-sky-600',
  new: 'from-teal-500 to-teal-600',
  at_risk: 'from-orange-500 to-orange-600',
  needs_attention: 'from-violet-500 to-violet-600',
  lost: 'from-rose-500 to-rose-600',
};

export default function SegmentsPage() {
  useRequirePageRole('customer-segments');
  const router = useRouter();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['rfm', workspaceId],
    queryFn: () => fetch(`/api/analytics/rfm?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const segments: Segment[] = data?.segments ?? [];
  const totals = data?.totals ?? { customers: 0, value: 0 };
  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Boxes className="h-6 w-6 text-brand-500" /> Customer Segments
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">RFM segments from order history — know who to reward, upsell and win back</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : segments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <Users className="h-10 w-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No order data yet</p>
          <p className="text-xs text-gray-400 mt-1">Segments appear once customers have orders recorded (via Shopify, manual, or the API).</p>
        </div>
      ) : (
        <>
          <div className="flex gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{totals.customers.toLocaleString('en-IN')}</p>
              <p className="text-sm text-gray-500">Customers segmented</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{money(totals.value)}</p>
              <p className="text-sm text-gray-500">Total order value</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {segments.map((s) => (
              <div key={s.segment} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-br ${SEG_COLOR[s.segment] ?? 'from-gray-500 to-gray-600'} p-4 text-white`}>
                  <p className="text-sm font-semibold">{s.label}</p>
                  <p className="text-3xl font-extrabold tabular-nums mt-1">{s.count}</p>
                  <p className="text-xs text-white/80">{money(s.value)} order value</p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-500">{s.tip}</p>
                  {s.contacts.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.contacts.slice(0, 6).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => router.push(`/contacts/${c.id}`)}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 hover:bg-brand-50 hover:text-brand-700"
                        >
                          {c.name ?? 'Customer'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

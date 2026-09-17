'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gift, RefreshCw, Users, Trophy, CheckCircle2, Info } from 'lucide-react';
import { useRequirePageRole } from '@/hooks/useRequirePageRole';
import { useWorkspaceStore } from '@/store/workspace.store';

interface Leader { id: string; name: string; total: number; converted: number }
interface Recent { id: string; referred_name: string | null; referred_phone: string | null; status: string; created_at: string; referrer?: { name?: string | null } }

const STATUS_CLS: Record<string, string> = {
  pending: 'border-gray-200 text-gray-500',
  joined: 'border-sky-200 text-sky-700 bg-sky-50',
  converted: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  rewarded: 'border-amber-200 text-amber-700 bg-amber-50',
};

export default function ReferralsPage() {
  useRequirePageRole('referrals');
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['referrals', workspaceId],
    queryFn: () => fetch(`/api/referrals?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const totals = data?.totals ?? { referrals: 0, converted: 0, referrers: 0 };
  const leaderboard: Leader[] = data?.leaderboard ?? [];
  const recent: Recent[] = data?.recent ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Gift className="h-6 w-6 text-brand-500" /> Referrals
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Turn happy customers into your best salespeople</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
        <p className="text-xs text-brand-800">
          Get any customer&apos;s personal referral link from their profile (Contacts → open a contact → Referral link).
          Share it — anyone who joins via that link is tracked here and credited to them.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total referrals', value: totals.referrals, icon: Gift, color: 'bg-brand-500' },
          { label: 'Converted', value: totals.converted, icon: CheckCircle2, color: 'bg-emerald-500' },
          { label: 'Referrers', value: totals.referrers, icon: Users, color: 'bg-amber-500' },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl mb-3 ${k.color}`}>
              <k.icon className="h-4 w-4 text-white" />
            </div>
            {isLoading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-bold text-gray-900 tabular-nums">{k.value.toLocaleString('en-IN')}</p>}
            <p className="text-sm font-medium text-gray-700 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Leaderboard */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900">Top referrers</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {isLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-3"><Skeleton className="h-4 w-full" /></div>)}
            {!isLoading && leaderboard.length === 0 && <p className="p-6 text-center text-sm text-gray-400">No referrals yet.</p>}
            {!isLoading && leaderboard.map((l, i) => (
              <div key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{l.name}</span>
                <span className="text-xs text-gray-400">{l.converted} converted</span>
                <span className="text-sm font-bold text-gray-900 tabular-nums">{l.total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent referrals</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {isLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-3"><Skeleton className="h-4 w-full" /></div>)}
            {!isLoading && recent.length === 0 && <p className="p-6 text-center text-sm text-gray-400">No referrals yet.</p>}
            {!isLoading && recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.referred_name ?? r.referred_phone ?? 'New lead'}</p>
                  <p className="text-xs text-gray-400 truncate">via {r.referrer?.name ?? 'a customer'} · {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <Badge variant="outline" className={`text-xs capitalize ${STATUS_CLS[r.status] ?? STATUS_CLS.pending}`}>{r.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

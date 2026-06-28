'use client';

import { useQuery } from '@tanstack/react-query';
import { MessageVolumeChart } from '@/modules/admin/components/charts/MessageVolumeChart';
import { ClientGrowthChart } from '@/modules/admin/components/charts/ClientGrowthChart';
import { Skeleton } from '@/components/ui/skeleton';

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'dashboard'],
    queryFn:  () => fetch('/api/admin/analytics/dashboard').then(r => r.json()),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Analytics</h1>
        <p className="text-sm text-gray-400 mt-0.5">Usage, growth and performance across all clients</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Message Volume</h3>
          <p className="text-xs text-gray-400 mb-4">Total messages across all workspaces</p>
          {isLoading ? <Skeleton className="h-52 w-full" /> : <MessageVolumeChart data={data?.message_volume ?? []} />}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Client Growth</h3>
          <p className="text-xs text-gray-400 mb-4">New and cumulative clients over time</p>
          {isLoading ? <Skeleton className="h-52 w-full" /> : <ClientGrowthChart data={data?.client_growth ?? []} />}
        </div>
      </div>

      {/* Top Clients Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Client Usage Rankings</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Messages</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Health</th>
            </tr>
          </thead>
          <tbody>
            {(data?.top_clients ?? []).map((c: any) => (
              <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-3 font-medium text-gray-800">{c.name}</td>
                <td className="px-4 py-3 text-right text-gray-600">{c.messages.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs rounded-full bg-orange-50 text-orange-700 px-2 py-0.5 capitalize">{c.plan}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-bold ${c.health > 70 ? 'text-emerald-600' : c.health > 40 ? 'text-amber-600' : 'text-red-500'}`}>
                    {c.health}/100
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

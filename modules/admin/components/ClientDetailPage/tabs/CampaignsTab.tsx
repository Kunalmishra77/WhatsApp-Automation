'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Props { workspaceId: string }

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  running:   'bg-blue-100 text-blue-700',
  failed:    'bg-red-100 text-red-700',
  draft:     'bg-gray-100 text-gray-500',
  scheduled: 'bg-amber-100 text-amber-700',
};

export function CampaignsTab({ workspaceId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'client-analytics', workspaceId],
    queryFn:  () => fetch(`/api/admin/analytics/client/${workspaceId}`).then(r => r.json()),
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const campaignStats: Array<{
    name: string;
    sent: number;
    delivered: number;
    replied: number;
    failed: number;
  }> = data?.campaign_stats ?? [];

  const totalReplied = campaignStats.reduce((a, c) => a + (c.replied ?? 0), 0);
  const avgDelivery  = campaignStats.length > 0
    ? Math.round(campaignStats.reduce((a, c) => a + (c.sent > 0 ? (c.delivered / c.sent) * 100 : 0), 0) / campaignStats.length)
    : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Campaigns',    value: data?.kpis?.campaigns_total ?? 0 },
          { label: 'Avg Delivery Rate',  value: `${avgDelivery}%` },
          { label: 'Total Replies',      value: totalReplied.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center">
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Campaigns table */}
      {campaignStats.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No campaigns yet</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivered</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Replied</th>
              <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {campaignStats.map((c) => (
              <tr key={c.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-800 truncate max-w-[200px]">{c.name}</td>
                <td className="px-3 py-3 text-right text-gray-600">{c.sent?.toLocaleString()}</td>
                <td className="px-3 py-3 text-right text-gray-600">
                  {c.delivered?.toLocaleString()}
                  <span className="text-xs text-gray-400 ml-1">
                    ({c.sent > 0 ? Math.round((c.delivered / c.sent) * 100) : 0}%)
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-gray-600">{c.replied?.toLocaleString()}</td>
                <td className="px-3 py-3 text-center">
                  <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium', STATUS_STYLE['completed'])}>
                    Completed
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

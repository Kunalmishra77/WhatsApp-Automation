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

interface CampaignStat {
  name: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  status: string;
  created_at: string;
}

export function CampaignsTab({ workspaceId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'client-analytics', workspaceId],
    queryFn:  () => fetch(`/api/admin/analytics/client/${workspaceId}`).then(r => r.json()),
    staleTime: 30_000,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const campaignStats: CampaignStat[] = data?.campaign_stats ?? [];
  const kpis = data?.kpis ?? {};

  const totalSent      = kpis.campaign_sent_total ?? campaignStats.reduce((a, c) => a + c.sent, 0);
  const totalDelivered = kpis.campaign_delivered   ?? campaignStats.reduce((a, c) => a + c.delivered, 0);
  const totalReplied   = kpis.campaign_replied     ?? campaignStats.reduce((a, c) => a + c.replied, 0);
  const avgDelivery    = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;
  const replyRate      = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Campaigns',   value: kpis.campaigns_total ?? campaignStats.length },
          { label: 'Total Sent',        value: totalSent.toLocaleString() },
          { label: 'Delivered',         value: `${totalDelivered.toLocaleString()} (${avgDelivery}%)` },
          { label: 'Replies',           value: `${totalReplied.toLocaleString()} (${replyRate}%)` },
          { label: 'Delivery Rate',     value: `${avgDelivery}%` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
            <p className="text-lg font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Campaigns table */}
      {campaignStats.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No campaigns yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivered</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Read</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Replied</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaignStats.map((c, i) => (
                <tr key={`${c.name}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-800 truncate max-w-[180px]" title={c.name}>{c.name}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700 font-medium">{c.sent.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">
                    {c.delivered.toLocaleString()}
                    {c.sent > 0 && <span className="text-xs text-gray-400 ml-1">({Math.round(c.delivered/c.sent*100)}%)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-600">
                    {c.read.toLocaleString()}
                    {c.delivered > 0 && <span className="text-xs text-gray-400 ml-1">({Math.round(c.read/c.delivered*100)}%)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-600">
                    <span className={cn('font-medium', c.replied > 0 ? 'text-emerald-600' : 'text-gray-400')}>
                      {c.replied.toLocaleString()}
                    </span>
                    {c.sent > 0 && c.replied > 0 && <span className="text-xs text-gray-400 ml-1">({Math.round(c.replied/c.sent*100)}%)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium', STATUS_STYLE[c.status] ?? 'bg-gray-100 text-gray-500')}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

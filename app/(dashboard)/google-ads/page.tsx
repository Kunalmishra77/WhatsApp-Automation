'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MousePointerClick, RefreshCw, Copy, Check, Link2 } from 'lucide-react';
import { useRequirePageRole } from '@/hooks/useRequirePageRole';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function GoogleAdsPage() {
  useRequirePageRole('google-ads');
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['gads-status', workspaceId],
    queryFn: () => fetch(`/api/integrations/google-ads/status?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
  });

  const { data: campData } = useQuery({
    queryKey: ['gads-campaigns', workspaceId],
    queryFn: () => fetch(`/api/google-ads/campaigns?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId && !!status?.connected,
  });

  const { data: hook } = useQuery({
    queryKey: ['gads-webhook', workspaceId],
    queryFn: () => fetch(`/api/google-ads/lead-webhook-info?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
  });

  const campaigns = campData?.campaigns ?? [];
  const totals = campData?.totals ?? { cost: 0, clicks: 0, impressions: 0, conversions: 0 };

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await fetch('/api/integrations/google-ads/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Sync failed');
      toast.success('Synced from Google Ads');
      void qc.invalidateQueries({ queryKey: ['gads-campaigns'] });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Sync failed'); }
    finally { setSyncing(false); }
  }

  function copy(text: string, tag: string) {
    void navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MousePointerClick className="h-6 w-6 text-brand-500" /> Google Ads
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Campaign performance + lead-form capture into your unified hub</p>
        </div>
        {status?.connected && (
          <Button variant="outline" size="sm" onClick={() => void handleSync()} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync'}
          </Button>
        )}
      </div>

      {/* ── Campaign reporting (Part B) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Campaign performance</h2>
        {statusLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !status?.connected ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-gray-500">Connect your Google Ads account to see campaigns, spend and conversions here.</p>
            <a href={`/api/integrations/google-ads/connect?workspaceId=${workspaceId}`}>
              <Button className="bg-brand-500 hover:bg-brand-600 text-white">Connect Google Ads</Button>
            </a>
            <p className="text-xs text-gray-400">Reporting activates once your Google Ads API developer token is approved.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              {[
                { label: 'Spend (30d)', value: inr(totals.cost) },
                { label: 'Clicks', value: Number(totals.clicks).toLocaleString('en-IN') },
                { label: 'Impressions', value: Number(totals.impressions).toLocaleString('en-IN') },
                { label: 'Conversions', value: Number(totals.conversions).toLocaleString('en-IN') },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border border-gray-100 p-4">
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">{k.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{k.label}</p>
                </div>
              ))}
            </div>
            {campaigns.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No campaign data yet. Hit Sync (needs an approved developer token).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Campaign</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Spend</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Clicks</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c: any) => (
                      <tr key={c.campaign_id} className="border-b border-gray-50">
                        <td className="px-4 py-2.5">
                          <span className="text-gray-800">{c.name ?? c.campaign_id}</span>
                          {c.status && <Badge variant="outline" className="ml-2 text-[10px]">{c.status}</Badge>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{inr(c.cost)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{Number(c.clicks).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{Number(c.conversions).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Lead form setup (Part A — works without the API/token) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-gray-900">Lead form capture</h2>
          <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700 bg-emerald-50">No token needed</Badge>
        </div>
        <p className="text-xs text-gray-500">
          Paste this <b>Webhook URL</b> and <b>Key</b> into your Google Ads <b>Lead Form asset → Delivery</b>. Every submission
          becomes a lead in your Unified Hub (channel: Google Ads) automatically.
        </p>
        {[
          { label: 'Webhook URL', value: hook?.webhookUrl ?? '', tag: 'url' },
          { label: 'Key', value: hook?.key ?? '', tag: 'key' },
        ].map((f) => (
          <div key={f.tag} className="flex items-center gap-2">
            <div className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700 truncate">
              {f.value || '…'}
            </div>
            <Button variant="outline" size="sm" onClick={() => copy(f.value, f.tag)} disabled={!f.value}>
              {copied === f.tag ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Trash2, DownloadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RetentionInfo {
  status: 'active' | 'expiring' | 'expired' | 'deleted';
  retention_at: string;
  days_remaining: number;
  recipient_count: number;
  data_exported_at: string | null;
  data_deleted_at: string | null;
}

const BADGE: Record<RetentionInfo['status'], string> = {
  active:   'bg-emerald-100 text-emerald-700',
  expiring: 'bg-amber-100 text-amber-700',
  expired:  'bg-red-100 text-red-700',
  deleted:  'bg-gray-100 text-gray-600',
};
const LABEL: Record<RetentionInfo['status'], string> = {
  active: 'Active', expiring: 'Expiring soon', expired: 'Expired — action needed', deleted: 'Data deleted',
};

export function CampaignRetention({ campaignId }: { campaignId: string }) {
  const [info, setInfo] = useState<RetentionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/retention`);
    if (res.ok) { setInfo(await res.json() as RetentionInfo); setLoadError(false); return; }
    if (res.status === 403) return; // no permission — stay hidden
    setLoadError(true);
  }, [campaignId]);

  useEffect(() => { void load(); }, [load]);

  const download = () => window.open(`/api/campaigns/${campaignId}/retention/export`, '_blank');

  const doDelete = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/retention/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      if (!res.ok) { setError((await res.json()).error ?? 'Delete failed'); return; }
      // Optimistic update so the tombstone shows even if the re-fetch below fails.
      setInfo((prev) => prev ? { ...prev, status: 'deleted', data_deleted_at: new Date().toISOString() } : prev);
      await load();
    } finally { setBusy(false); }
  }, [campaignId, load]);

  const onDeleteClick = () => {
    if (window.confirm('Delete this campaign’s recipient data? The campaign and its stats are kept, but the per-recipient details cannot be recovered.')) {
      void doDelete();
    }
  };
  const onDownloadDelete = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/retention/export`);
      if (!res.ok) { setError('Export failed — data was NOT deleted.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign_${campaignId}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      if (window.confirm('Your copy has downloaded. Delete this campaign’s recipient data now?')) {
        await doDelete();
      }
    } catch {
      setError('Export failed — data was NOT deleted.');
    } finally {
      setBusy(false);
    }
  }, [campaignId, doDelete]);

  if (!info && !loadError) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Data Retention</h3>
        {info && <span className={cn('text-[11px] rounded-full px-2.5 py-0.5 font-semibold', BADGE[info.status])}>{LABEL[info.status]}</span>}
      </div>
      {!info ? (
        <p className="text-xs text-muted-foreground">Couldn&rsquo;t load retention status.</p>
      ) : info.status === 'deleted' ? (
        <p className="text-xs text-muted-foreground">
          Data deleted on {info.data_deleted_at ? new Date(info.data_deleted_at).toLocaleDateString() : '—'}. Campaign stats are retained.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {info.recipient_count} recipient record(s). Retention date: {new Date(info.retention_at).toLocaleDateString()}
            {info.status === 'expired' ? ' (passed)' : ` (${info.days_remaining} day(s) left)`}.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={download}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={() => void onDownloadDelete()}>
              <DownloadCloud className="h-3.5 w-3.5" /> Download &amp; Delete
            </Button>
            <Button size="sm" variant="destructive" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={onDeleteClick}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

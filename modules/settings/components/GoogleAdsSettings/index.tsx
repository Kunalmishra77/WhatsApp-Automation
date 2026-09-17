'use client';

import { useState, useEffect } from 'react';
import { MousePointerClick, ExternalLink, Loader2, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';

interface AdsStatus {
  connected: boolean;
  email?: string;
  customer_id?: string;
  connected_at?: string;
  last_synced_at?: string;
}

export function GoogleAdsSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [status, setStatus] = useState<AdsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const gads = searchParams.get('gads');
    if (gads === 'success') toast.success('Google Ads connected!');
    else if (gads === 'error') toast.error('Google Ads connection failed. Try again.');
    else if (gads === 'no_refresh_token') toast.error('No refresh token received. Disconnect existing Google access and retry.');
  }, [searchParams]);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/integrations/google-ads/status?workspaceId=${workspaceId}`);
        if (!res.ok) throw new Error(`Status check failed (${res.status})`);
        setStatus(await res.json() as AdsStatus);
      } catch (err) {
        console.error('[GoogleAds] status check failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  const handleConnect = () => { window.location.href = `/api/integrations/google-ads/connect?workspaceId=${workspaceId}`; };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch('/api/integrations/google-ads/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }),
      });
      setStatus({ connected: false });
      toast.success('Google Ads disconnected');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Google Ads</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          See campaign spend &amp; performance, and capture Google Ads lead-form submissions into your CRM.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        ) : status?.connected ? (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <MousePointerClick className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Connected{status.email ? ` · ${status.email}` : ''}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {status.customer_id ? `Account ${status.customer_id}` : 'Reporting activates once the developer token is approved'}
                </p>
                <a href="/google-ads" className="text-xs text-brand-600 underline mt-0.5 inline-block">Open Google Ads →</a>
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 shrink-0"
              onClick={() => void handleDisconnect()} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />} Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Not connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">Lead-form capture works without connecting — see the Google Ads page.</p>
              </div>
            </div>
            <Button size="sm" onClick={handleConnect} className="gap-1.5 shrink-0">
              <ExternalLink className="h-3.5 w-3.5" /> Connect Google
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

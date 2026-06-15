'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, AlertCircle, Camera, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useWorkspaceStore } from '@/store/workspace.store';

interface IgAccount {
  ig_user_id:       string;
  page_id:          string | null;
  username:         string | null;
  name:             string | null;
  webhook_verified: boolean;
  created_at:       string;
}

interface FormState {
  igUserId:    string;
  pageId:      string;
  accessToken: string;
  username:    string;
}

export function InstagramSettings() {
  const workspace = useWorkspaceStore((s) => s.activeWorkspace);
  const [account, setAccount] = useState<IgAccount | null>(null);
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const [form, setForm] = useState<FormState>({
    igUserId:    '',
    pageId:      '',
    accessToken: '',
    username:    '',
  });

  function setF<K extends keyof FormState>(k: K, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  useEffect(() => {
    if (!workspace?.id) return;
    setLoading(true);
    fetch(`/api/instagram/connect?workspaceId=${workspace.id}`)
      .then((r) => r.json())
      .then((d: { account: IgAccount | null }) => setAccount(d.account ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspace?.id]);

  async function handleConnect() {
    if (!form.igUserId.trim() || !form.accessToken.trim()) {
      toast.error('Instagram Account ID and Access Token are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/instagram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace!.id,
          igUserId:    form.igUserId.trim(),
          pageId:      form.pageId.trim() || undefined,
          accessToken: form.accessToken.trim(),
          username:    form.username.trim() || undefined,
        }),
      });
      const data = await res.json() as { success?: boolean; username?: string; name?: string; error?: string };
      if (data.success) {
        toast.success('✅ Instagram connected!');
        // Re-fetch account info
        const r2 = await fetch(`/api/instagram/connect?workspaceId=${workspace!.id}`);
        const d2 = await r2.json() as { account: IgAccount | null };
        setAccount(d2.account ?? null);
        setForm({ igUserId: '', pageId: '', accessToken: '', username: '' });
      } else {
        toast.error(data.error ?? 'Failed to connect Instagram');
      }
    } catch {
      toast.error('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setConfirmDisconnect(false);
    setSaving(true);
    try {
      await fetch('/api/instagram/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace!.id }),
      });
      setAccount(null);
      toast.success('Instagram disconnected.');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-20 animate-pulse rounded-lg bg-muted" />;
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Instagram DM Inbox
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your Instagram Business account to receive and reply to DMs from the same inbox.
        </p>
      </div>
      <Separator />

      {account ? (
        /* ── Connected state ── */
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <Badge className="bg-emerald-100 text-emerald-700 text-xs">Connected</Badge>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
            {account.name && (
              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{account.name}</span></div>
            )}
            {account.username && (
              <div><span className="text-muted-foreground">Username:</span> <span className="font-medium">@{account.username}</span></div>
            )}
            <div><span className="text-muted-foreground">Account ID:</span> <span className="font-mono text-xs">{account.ig_user_id}</span></div>
            {account.page_id && (
              <div><span className="text-muted-foreground">Page ID:</span> <span className="font-mono text-xs">{account.page_id}</span></div>
            )}
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
            <p className="font-semibold mb-1">Webhook setup</p>
            <p className="mb-1">Add this webhook URL in your Meta App → Webhooks → instagram → messages:</p>
            <code className="block bg-blue-100 rounded px-2 py-1 break-all">
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/instagram
            </code>
            <p className="mt-1">Verify Token: <code className="bg-blue-100 px-1 rounded">agentix-webhook-secret-2026</code></p>
            <p className="mt-1">Subscribe to: <strong>messages</strong></p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/5"
            onClick={() => setConfirmDisconnect(true)}
            disabled={saving}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Disconnect Instagram
          </Button>
        </div>
      ) : (
        /* ── Connect form ── */
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <Badge className="bg-amber-100 text-amber-700 text-xs">Not connected</Badge>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">How to connect</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to <strong>Meta for Developers</strong> → your app → Instagram → API setup</li>
              <li>Generate a <strong>Page Access Token</strong> with <code className="bg-muted rounded px-1">instagram_manage_messages</code> permission</li>
              <li>Copy your <strong>Instagram Business Account ID</strong> (not username)</li>
              <li>Paste both below and click Connect</li>
            </ol>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="igUserId">Instagram Business Account ID <span className="text-destructive">*</span></Label>
              <Input
                id="igUserId"
                value={form.igUserId}
                onChange={(e) => setF('igUserId', e.target.value)}
                placeholder="17841400455970765"
              />
              <p className="text-xs text-muted-foreground">Found in Meta Business Suite → Settings → Business Info</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pageId">Facebook Page ID <span className="text-muted-foreground text-xs">(optional but recommended)</span></Label>
              <Input
                id="pageId"
                value={form.pageId}
                onChange={(e) => setF('pageId', e.target.value)}
                placeholder="123456789"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="igToken">Page Access Token <span className="text-destructive">*</span></Label>
              <Input
                id="igToken"
                type="password"
                value={form.accessToken}
                onChange={(e) => setF('accessToken', e.target.value)}
                placeholder="EAAxxxxx..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="igUsername">Instagram Username <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="igUsername"
                value={form.username}
                onChange={(e) => setF('username', e.target.value)}
                placeholder="yourbrand"
              />
            </div>
          </div>

          <Button onClick={handleConnect} disabled={saving} className="gap-2">
            {saving
              ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Connecting…</>
              : <><Camera className="h-3.5 w-3.5" /> Connect Instagram</>}
          </Button>
        </div>
      )}
    <ConfirmDialog
      open={confirmDisconnect}
      title="Disconnect Instagram?"
      description="Existing Instagram conversations will remain but no new DMs will arrive."
      confirmLabel="Disconnect"
      variant="warning"
      onConfirm={() => void handleDisconnect()}
      onCancel={() => setConfirmDisconnect(false)}
    />
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { IndianRupee, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceStore } from '@/store/workspace.store';

interface WorkspaceSettings {
  razorpay_key_id?: string;
  razorpay_key_secret?: string;
}

export function IntegrationSettings() {
  const workspace = useWorkspaceStore((s) => s.activeWorkspace);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!workspace?.id || loaded) return;

    fetch(`/api/settings/workspace?workspaceId=${workspace.id}`)
      .then((r) => r.json())
      .then((data: { workspace?: { settings?: WorkspaceSettings } }) => {
        const s = data.workspace?.settings ?? {};
        setKeyId(s.razorpay_key_id ?? '');
        setKeySecret(s.razorpay_key_secret ?? '');
        setLoaded(true);
      })
      .catch(() => {
        // silently fail — workspace settings may not include Razorpay yet
        setLoaded(true);
      });
  }, [workspace?.id, loaded]);

  const handleSave = async () => {
    if (!workspace?.id) return;
    setSaving(true);
    try {
      const settings: WorkspaceSettings = { razorpay_key_id: keyId };
      // Only send secret if it's not the masked placeholder
      if (keySecret && keySecret !== '••••••••') {
        settings.razorpay_key_secret = keySecret;
      }

      const res = await fetch('/api/settings/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id, settings }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      toast.success('Razorpay settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = !!(keyId && keySecret);

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect third-party payment and service providers.</p>
      </div>
      <Separator />

      {/* Razorpay */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted">
            <IndianRupee className="h-5 w-5 text-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Razorpay</p>
            <p className="text-xs text-muted-foreground">Send payment links directly in conversations</p>
          </div>
          {isConfigured ? (
            <Badge className="bg-emerald-100 text-emerald-700 text-xs">Connected</Badge>
          ) : (
            <Badge className="bg-muted text-muted-foreground text-xs">Not configured</Badge>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rzp-key-id">API Key ID</Label>
            <Input
              id="rzp-key-id"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="rzp_live_…"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rzp-key-secret">API Key Secret</Label>
            <div className="relative">
              <Input
                id="rzp-key-secret"
                type={showSecret ? 'text' : 'password'}
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                placeholder="Your Razorpay secret key"
                className="font-mono text-sm pr-9"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowSecret((v) => !v)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Find your keys in the{' '}
              <a
                href="https://dashboard.razorpay.com/app/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                Razorpay Dashboard
              </a>
            </p>
          </div>

          <Button size="sm" onClick={() => void handleSave()} disabled={saving || !keyId}>
            {saving ? 'Saving…' : 'Save Razorpay Keys'}
          </Button>
        </div>
      </div>
    </div>
  );
}

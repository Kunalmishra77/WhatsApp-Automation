'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';

export function WhatsAppSettings() {
  const workspace   = useWorkspaceStore((s) => s.activeWorkspace);
  const workspaceId = workspace?.id ?? '';
  const isConfigured = !!(workspace?.waba_id && workspace.phone_number_id);

  const [appId,    setAppId]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [showId,   setShowId]   = useState(false);

  // Load saved app_id from workspace settings
  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/settings/workspace?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: { workspace?: { settings?: { app_id?: string } } }) => {
        setAppId(d.workspace?.settings?.app_id ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleSave = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/workspace', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, settings: { app_id: appId.trim() } }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      toast.success('App ID saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">WhatsApp Business API</h2>
        <p className="text-sm text-muted-foreground">WhatsApp Business Account (WABA) configuration.</p>
      </div>
      <Separator />

      <div className="flex items-center gap-2">
        {isConfigured ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <Badge className="bg-emerald-100 text-emerald-700 text-xs">Connected</Badge>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <Badge className="bg-amber-100 text-amber-700 text-xs">Not configured</Badge>
          </>
        )}
      </div>

      {/* Read-only core credentials (set by admin/env) */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>WABA ID</Label>
          <Input value={workspace?.waba_id ?? ''} disabled className="bg-muted font-mono text-sm" placeholder="Not set" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone Number ID</Label>
          <Input value={workspace?.phone_number_id ?? ''} disabled className="bg-muted font-mono text-sm" placeholder="Not set" />
        </div>
        <p className="text-xs text-muted-foreground">
          WABA ID and Phone Number ID are set by your platform admin.
        </p>
      </div>

      <Separator />

      {/* Facebook App ID — per-workspace, editable */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Facebook App ID</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Required to upload media for template headers. Find it in your{' '}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline"
            >
              Meta Developer portal
            </a>
            .
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appId">App ID</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="appId"
                type={showId ? 'text' : 'password'}
                value={loading ? '' : appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder={loading ? 'Loading…' : 'e.g. 1234567890123456'}
                disabled={loading}
                className="font-mono text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowId((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button onClick={handleSave} disabled={saving || loading} size="sm" className="shrink-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700 space-y-1">
          <p className="font-semibold">How to find your App ID:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Go to developers.facebook.com → My Apps</li>
            <li>Click your WhatsApp app</li>
            <li>Copy the App ID shown at the top of the page</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

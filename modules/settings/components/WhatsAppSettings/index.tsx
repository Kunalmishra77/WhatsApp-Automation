'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

  const [appId,       setAppId]       = useState('');
  const [persona,     setPersona]     = useState('');
  const [saving,      setSaving]      = useState(false);
  const [savingBot,   setSavingBot]   = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [showId,      setShowId]      = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/settings/workspace?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: { workspace?: { settings?: { app_id?: string; agent_persona?: string } } }) => {
        setAppId(d.workspace?.settings?.app_id ?? '');
        setPersona(d.workspace?.settings?.agent_persona ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const patchSettings = async (settings: Record<string, string>, label: string, setLoaderFn: (v: boolean) => void) => {
    if (!workspaceId) return;
    setLoaderFn(true);
    try {
      const res = await fetch('/api/settings/workspace', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, settings }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoaderFn(false);
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

      {/* Read-only core credentials (set by admin) */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>WABA ID</Label>
          <Input value={workspace?.waba_id ?? ''} disabled className="bg-muted font-mono text-sm" placeholder="Not set" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone Number ID</Label>
          <Input value={workspace?.phone_number_id ?? ''} disabled className="bg-muted font-mono text-sm" placeholder="Not set" />
        </div>
        <p className="text-xs text-muted-foreground">WABA ID and Phone Number ID are set by your platform admin.</p>
      </div>

      <Separator />

      {/* Facebook App ID */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Facebook App ID</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Required to upload media for template headers. Find it in your{' '}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
              Meta Developer portal
            </a>.
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
            <Button
              onClick={() => void patchSettings({ app_id: appId.trim() }, 'App ID saved', setSaving)}
              disabled={saving || loading}
              size="sm"
              className="shrink-0"
            >
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

      <Separator />

      {/* AI Agent Persona */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">AI Agent Persona</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Describe your business, what the AI should help with, and how it should behave. This is injected as the AI's system prompt.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="persona">System Prompt / Persona</Label>
          <Textarea
            id="persona"
            rows={7}
            value={loading ? '' : persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder={loading ? 'Loading…' : `Example:\nYou are a helpful assistant for [Company Name].\n[Company Name] sells [product/service].\n\nWhen a customer taps "Book Demo", ask for their preferred date and time.\nWhen asked about price, mention [plan] at [price] per year.\nAlways be warm and concise. Reply in the customer's language.`}
            disabled={loading}
            className="text-sm font-mono resize-y"
          />
        </div>
        <Button
          onClick={() => void patchSettings({ agent_persona: persona.trim() }, 'AI persona saved', setSavingBot)}
          disabled={savingBot || loading}
          size="sm"
        >
          {savingBot ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
          Save Persona
        </Button>
        <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Tips for a good persona:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Describe what your business does in 1-2 sentences</li>
            <li>Explain how to handle common button clicks (Book Demo, Know More, etc.)</li>
            <li>Set the tone: formal, casual, Hinglish, etc.</li>
            <li>Add product/pricing info you want the bot to know (or use Knowledge Base instead)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

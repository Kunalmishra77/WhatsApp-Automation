'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Copy, Key, Loader2, Code, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const BASE = 'https://whatsapp-automation-kohl-six.vercel.app';

const ENDPOINTS = [
  { method: 'GET',  path: '/api/v1/contacts',       desc: 'List contacts (page, limit, search, tag)' },
  { method: 'POST', path: '/api/v1/contacts',       desc: 'Create / upsert contact { phone, name, email, tags }' },
  { method: 'GET',  path: '/api/v1/conversations',  desc: 'List conversations (status, page, limit)' },
  { method: 'POST', path: '/api/v1/messages',       desc: 'Send WhatsApp message { to, message } or { conversationId, message }' },
  { method: 'GET',  path: '/api/v1/templates',      desc: 'List templates (status=approved)' },
  { method: 'GET',  path: '/api/v1/broadcasts',     desc: 'List broadcast campaigns' },
  { method: 'POST', path: '/api/v1/broadcasts',     desc: 'Create & trigger broadcast { name, templateId, audienceType }' },
];

const METHOD_COLOR: Record<string, string> = {
  GET:    'bg-green-100 text-green-700',
  POST:   'bg-blue-100 text-blue-700',
  PATCH:  'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

export function ApiKeys() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/settings/api-keys?workspaceId=${workspaceId}`);
      const data = await res.json() as { keys?: ApiKey[] };
      setKeys(data.keys ?? []);
    } finally { setIsLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void fetchKeys(); }, [fetchKeys]);

  const handleCreate = async () => {
    if (!workspaceId || !newKeyName.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name: newKeyName.trim() }),
      });
      const data = await res.json() as { key?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setCreatedKey(data.key ?? null);
      setNewKeyName('');
      void fetchKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally { setIsSaving(false); }
  };

  const handleToggle = async (key: ApiKey) => {
    if (!workspaceId) return;
    await fetch('/api/settings/api-keys', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: key.id, workspaceId, isActive: !key.is_active }),
    });
    setKeys((p) => p.map((k) => k.id === key.id ? { ...k, is_active: !k.is_active } : k));
  };

  const handleDelete = async (id: string) => {
    if (!workspaceId || !confirm('Revoke this API key? This cannot be undone.')) return;
    await fetch(`/api/settings/api-keys?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' });
    setKeys((p) => p.filter((k) => k.id !== id));
    toast.success('Key revoked');
  };

  const copy = (text: string, label = 'Copied!') => {
    void navigator.clipboard.writeText(text);
    toast.success(label);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Key className="h-5 w-5 text-brand-500" />
            Public REST API
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your apps and tools to Agentix using API keys.
            Base URL: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{BASE}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDocs((v) => !v)}>
            <Code className="h-3.5 w-3.5 mr-1.5" />{showDocs ? 'Hide' : 'API Reference'}
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />New Key
          </Button>
        </div>
      </div>

      {/* API Reference */}
      {showDocs && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">API Reference</p>
          <div className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs font-mono">
            <span className="text-slate-400"># Authentication</span>{'\n'}
            curl -H <span className="text-green-400">&quot;Authorization: Bearer agx_live_YOUR_KEY&quot;</span> \{'\n'}
            {'  '}{BASE}/api/v1/contacts
          </div>
          <div className="space-y-1.5">
            {ENDPOINTS.map((ep) => (
              <div key={ep.path} className="flex items-start gap-2 text-xs">
                <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold text-[10px]', METHOD_COLOR[ep.method] ?? 'bg-gray-100')}>{ep.method}</span>
                <code className="text-muted-foreground shrink-0">{ep.path}</code>
                <span className="text-muted-foreground">— {ep.desc}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Rate limit: 60 requests/minute per key. All responses are JSON.
          </p>
        </div>
      )}

      {/* Keys list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground justify-center"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Key className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No API keys yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create a key to start using the REST API.</p>
          <Button size="sm" className="mt-4" onClick={() => setDialogOpen(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Create API Key</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className={cn('rounded-xl border border-border bg-card p-4 flex items-center gap-4', !key.is_active && 'opacity-60')}>
              <Switch checked={key.is_active} onCheckedChange={() => void handleToggle(key)} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{key.name}</span>
                  {!key.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className="text-xs text-muted-foreground">{key.key_prefix}••••••••••••••••</code>
                  <span className="text-[10px] text-muted-foreground">Created {format(new Date(key.created_at), 'MMM d, yyyy')}</span>
                  {key.last_used_at && (
                    <span className="text-[10px] text-muted-foreground">· Last used {format(new Date(key.last_used_at), 'MMM d')}</span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive shrink-0" onClick={() => void handleDelete(key.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create key dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setCreatedKey(null); setNewKeyName(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{createdKey ? '🎉 API Key Created' : 'Create API Key'}</DialogTitle>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 font-medium">
                ⚠️ Copy this key now — it will not be shown again!
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-muted p-3 text-xs font-mono break-all">{createdKey}</code>
                <Button variant="outline" size="icon" className="shrink-0 h-9 w-9" onClick={() => copy(createdKey, 'API key copied!')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button className="w-full" onClick={() => { setDialogOpen(false); setCreatedKey(null); }}>Done</Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label>Key Name</Label>
                  <Input placeholder="e.g. Zapier Integration, My App" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Give it a name to remember what it's used for.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleCreate()} disabled={isSaving || !newKeyName.trim()}>
                  {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating…</> : 'Create Key'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

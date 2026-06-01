'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Zap, Loader2, CheckCircle2, XCircle,
  Copy, ExternalLink, RefreshCw,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  failure_count: number;
  created_at: string;
}

const ALL_EVENTS = [
  { id: 'message.received',     label: 'Message Received',     desc: 'Every inbound WhatsApp message' },
  { id: 'conversation.created', label: 'Conversation Created',  desc: 'New conversation started' },
  { id: 'conversation.resolved',label: 'Conversation Resolved', desc: 'Conversation marked resolved' },
  { id: 'contact.created',      label: 'Contact Created',       desc: 'New contact added' },
  { id: 'campaign.completed',   label: 'Campaign Completed',    desc: 'Broadcast campaign finished' },
];

function generateSecret() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function WebhookSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEndpoint, setEditEndpoint] = useState<WebhookEndpoint | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [formEvents, setFormEvents] = useState<Set<string>>(new Set(ALL_EVENTS.map((e) => e.id)));

  const fetchEndpoints = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/webhooks/outbound?workspaceId=${workspaceId}`);
      const data = await res.json() as { endpoints?: WebhookEndpoint[] };
      setEndpoints(data.endpoints ?? []);
    } catch { toast.error('Failed to load webhooks'); }
    finally { setIsLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void fetchEndpoints(); }, [fetchEndpoints]);

  const openAdd = () => {
    setEditEndpoint(null);
    setFormName('');
    setFormUrl('');
    setFormSecret(generateSecret());
    setFormEvents(new Set(ALL_EVENTS.map((e) => e.id)));
    setDialogOpen(true);
  };

  const openEdit = (ep: WebhookEndpoint) => {
    setEditEndpoint(ep);
    setFormName(ep.name);
    setFormUrl(ep.url);
    setFormSecret(ep.secret ?? '');
    setFormEvents(new Set(ep.events));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!workspaceId || !formName.trim() || !formUrl.trim()) {
      toast.error('Name and URL are required');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/webhooks/outbound', {
        method: editEndpoint ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editEndpoint?.id,
          workspaceId,
          name: formName,
          url: formUrl,
          secret: formSecret || null,
          events: [...formEvents],
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      toast.success(editEndpoint ? 'Webhook updated' : 'Webhook added');
      setDialogOpen(false);
      void fetchEndpoints();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally { setIsSaving(false); }
  };

  const handleToggle = async (ep: WebhookEndpoint) => {
    if (!workspaceId) return;
    try {
      await fetch('/api/webhooks/outbound', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ep.id, workspaceId, isActive: !ep.is_active }),
      });
      setEndpoints((prev) => prev.map((e) => e.id === ep.id ? { ...e, is_active: !e.is_active, failure_count: 0 } : e));
    } catch { toast.error('Failed to update'); }
  };

  const handleDelete = async (id: string) => {
    if (!workspaceId || !confirm('Delete this webhook endpoint?')) return;
    try {
      await fetch(`/api/webhooks/outbound?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' });
      toast.success('Webhook deleted');
      setEndpoints((prev) => prev.filter((e) => e.id !== id));
    } catch { toast.error('Failed to delete'); }
  };

  const handleTest = async (ep: WebhookEndpoint) => {
    if (!workspaceId) return;
    setTestingId(ep.id);
    try {
      const res = await fetch('/api/webhooks/outbound/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, endpointId: ep.id }),
      });
      const data = await res.json() as { success?: boolean; statusCode?: number; error?: string };
      if (data.success) {
        toast.success(`Test delivered! HTTP ${data.statusCode ?? 200}`);
      } else {
        toast.error(`Test failed: ${data.error ?? `HTTP ${data.statusCode}`}`);
      }
    } catch { toast.error('Test request failed'); }
    finally { setTestingId(null); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand-500" />
            Outbound Webhooks
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Send real-time events to Zapier, n8n, Make, or any custom URL.
            Connect Agentix to thousands of tools without writing code.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1.5" />Add Webhook
        </Button>
      </div>

      {/* Zapier/n8n quickstart */}
      <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
        <p className="text-sm font-medium mb-2">Quick Connect</p>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { name: 'Zapier', url: 'https://zapier.com/apps/webhooks' },
            { name: 'n8n', url: 'https://n8n.io' },
            { name: 'Make (Integromat)', url: 'https://make.com' },
            { name: 'Pabbly', url: 'https://pabbly.com' },
          ].map((tool) => (
            <a
              key={tool.name}
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white px-2.5 py-1 text-brand-700 hover:bg-brand-100 transition-colors"
            >
              {tool.name} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          In Zapier/n8n, use a <strong>Webhook trigger</strong> → copy the URL → paste it here.
        </p>
      </div>

      {/* Endpoints */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading…
        </div>
      ) : endpoints.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Zap className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No webhook endpoints yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add your first endpoint to start receiving events in Zapier, n8n, or your own server.</p>
          <Button size="sm" className="mt-4" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Webhook
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <div key={ep.id} className={cn('rounded-xl border border-border bg-card p-4', !ep.is_active && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <Switch checked={ep.is_active} onCheckedChange={() => void handleToggle(ep)} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{ep.name}</span>
                    {ep.failure_count > 2 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {ep.failure_count} failures
                      </Badge>
                    )}
                    {ep.last_triggered_at && (
                      <span className="text-[10px] text-muted-foreground">
                        Last: {format(new Date(ep.last_triggered_at), 'MMM d HH:mm')}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <code className="text-xs text-muted-foreground truncate max-w-xs">{ep.url}</code>
                    <button
                      onClick={() => { void navigator.clipboard.writeText(ep.url); toast.success('Copied!'); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ep.events.map((evt) => (
                      <span key={evt} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{evt}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => void handleTest(ep)}
                    disabled={testingId === ep.id}
                  >
                    {testingId === ep.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <><RefreshCw className="h-3 w-3 mr-1" />Test</>}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ep)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => void handleDelete(ep.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editEndpoint ? 'Edit Webhook' : 'Add Webhook Endpoint'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="e.g. Zapier CRM Sync, n8n Order Flow" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Endpoint URL</Label>
              <Input placeholder="https://hooks.zapier.com/hooks/catch/..." value={formUrl} onChange={(e) => setFormUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>
                Signing Secret <span className="text-muted-foreground text-xs">(optional — for verifying requests)</span>
              </Label>
              <div className="flex gap-2">
                <Input placeholder="Leave blank for no signing" value={formSecret} onChange={(e) => setFormSecret(e.target.value)} className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => setFormSecret(generateSecret())}>
                  Generate
                </Button>
              </div>
              {formSecret && (
                <p className="text-[11px] text-muted-foreground">
                  Verify with header: <code>X-Agentix-Signature: sha256=...</code>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Events to Subscribe</Label>
              <div className="space-y-2 rounded-lg border border-border p-3">
                {ALL_EVENTS.map((evt) => (
                  <label key={evt.id} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={formEvents.has(evt.id)}
                      onChange={(e) => {
                        const next = new Set(formEvents);
                        if (e.target.checked) next.add(evt.id); else next.delete(evt.id);
                        setFormEvents(next);
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium leading-none">{evt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{evt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !formName.trim() || !formUrl.trim() || formEvents.size === 0}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : editEndpoint ? 'Update' : 'Add Webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

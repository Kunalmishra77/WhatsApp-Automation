'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Plus, Pencil, Trash2, Cake, RefreshCw, ShoppingCart, Zap, Copy, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AutomationTrigger {
  id: string;
  name: string;
  trigger_type: 'birthday' | 're_engagement' | 'abandoned_cart';
  is_active: boolean;
  message: string;
  config: Record<string, unknown>;
  audience_filter: Record<string, unknown>;
  last_ran_at?: string;
  created_at: string;
}

const TRIGGER_META = {
  birthday: {
    icon: Cake,
    label: 'Birthday',
    color: 'bg-pink-50 border-pink-200 text-pink-700',
    iconColor: 'text-pink-500',
    description: 'Send a message to contacts on their birthday.',
    configFields: [
      { key: 'custom_field_key', label: 'Birthday field key', placeholder: 'birthday', hint: 'Name of the custom field that stores birthday date (YYYY-MM-DD)' },
    ],
  },
  re_engagement: {
    icon: RefreshCw,
    label: 'Re-engagement',
    color: 'bg-amber-50 border-amber-200 text-amber-700',
    iconColor: 'text-amber-500',
    description: 'Reach out to contacts who haven\'t replied in a while.',
    configFields: [
      { key: 'days', label: 'Days of inactivity', placeholder: '7', hint: 'Send message after this many days without a reply' },
    ],
  },
  abandoned_cart: {
    icon: ShoppingCart,
    label: 'Abandoned Cart',
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    iconColor: 'text-purple-500',
    description: 'Fire via webhook when a customer abandons their cart.',
    configFields: [
      { key: 'webhook_secret', label: 'Webhook secret', placeholder: 'my-secret-key', hint: 'Validate incoming webhook calls' },
      { key: 'delay_minutes', label: 'Delay (minutes)', placeholder: '30', hint: 'Wait before sending (0 = immediate)' },
    ],
  },
} as const;

type TriggerType = keyof typeof TRIGGER_META;

const DEFAULT_MESSAGES: Record<TriggerType, string> = {
  birthday:       'Happy Birthday {{name}}! 🎂 Wishing you a wonderful day. Here\'s a special offer just for you!',
  re_engagement:  'Hi {{name}}! 👋 We noticed we haven\'t heard from you in a while. Is there anything we can help you with?',
  abandoned_cart: 'Hi {{name}}! 🛒 You left something in your cart. Complete your purchase here: {{cart_url}}',
};

export function AutomationTriggersSettings() {
  const workspaceId  = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient  = useQueryClient();
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState<AutomationTrigger | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [copiedId,   setCopiedId]   = useState<string | null>(null);

  // Form state
  const [formType,    setFormType]    = useState<TriggerType>('birthday');
  const [formName,    setFormName]    = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formConfig,  setFormConfig]  = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['automation-triggers', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/automation-triggers?workspaceId=${workspaceId}`);
      if (!res.ok) return { triggers: [] };
      return res.json() as Promise<{ triggers: AutomationTrigger[] }>;
    },
    enabled: !!workspaceId,
  });

  const triggers = data?.triggers ?? [];

  function openNew(type: TriggerType) {
    setEditing(null);
    setFormType(type);
    setFormName(TRIGGER_META[type].label + ' Message');
    setFormMessage(DEFAULT_MESSAGES[type]);
    setFormConfig({});
    setFormOpen(true);
  }

  function openEdit(t: AutomationTrigger) {
    setEditing(t);
    setFormType(t.trigger_type);
    setFormName(t.name);
    setFormMessage(t.message);
    setFormConfig(Object.fromEntries(Object.entries(t.config).map(([k, v]) => [k, String(v)])));
    setFormOpen(true);
  }

  async function handleSave() {
    if (!formName.trim() || !formMessage.trim()) { toast.error('Name and message required'); return; }
    setSaving(true);
    try {
      const config = Object.fromEntries(
        Object.entries(formConfig).filter(([, v]) => v.trim()).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)]),
      );
      const body = {
        workspaceId,
        name:        formName.trim(),
        trigger_type: formType,
        message:     formMessage.trim(),
        config,
      };
      const url    = editing ? `/api/automation-triggers/${editing.id}` : '/api/automation-triggers';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json() as any; toast.error(d.error ?? 'Save failed'); return; }
      toast.success(editing ? 'Trigger updated!' : 'Trigger created!');
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['automation-triggers', workspaceId] });
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this trigger?')) return;
    await fetch(`/api/automation-triggers/${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    void queryClient.invalidateQueries({ queryKey: ['automation-triggers', workspaceId] });
  }

  async function handleToggle(t: AutomationTrigger) {
    await fetch(`/api/automation-triggers/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !t.is_active }),
    });
    void queryClient.invalidateQueries({ queryKey: ['automation-triggers', workspaceId] });
  }

  function copyWebhookUrl(t: AutomationTrigger) {
    const url = `${window.location.origin}/api/webhooks/abandoned-cart?trigger_id=${t.id}`;
    void navigator.clipboard.writeText(url);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Webhook URL copied!');
  }

  const meta = TRIGGER_META[formType];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold">Automation Triggers</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Auto-send WhatsApp messages based on events — birthdays, inactivity, abandoned carts.
          Use <code className="text-xs bg-muted px-1 rounded">{'{{name}}'}</code> in your message to personalise.
        </p>
      </div>

      {/* New trigger buttons */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(TRIGGER_META) as TriggerType[]).map((type) => {
          const m = TRIGGER_META[type];
          const Icon = m.icon;
          return (
            <button
              key={type}
              onClick={() => openNew(type)}
              className={cn('flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left transition-all hover:shadow-md', m.color)}
            >
              <Icon className={cn('h-5 w-5 shrink-0', m.iconColor)} />
              <div>
                <p className="text-sm font-semibold">{m.label}</p>
                <p className="text-[11px] opacity-70 leading-tight mt-0.5">{m.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Trigger list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : triggers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No triggers yet</p>
          <p className="text-xs mt-1">Click a trigger type above to create your first automation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {triggers.map((t) => {
            const m = TRIGGER_META[t.trigger_type];
            const Icon = m.icon;
            return (
              <div key={t.id} className={cn('rounded-xl border p-4', t.is_active ? m.color : 'border-border bg-muted/30 opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn('mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0', t.is_active ? 'bg-white/60' : 'bg-muted')}>
                      <Icon className={cn('h-4 w-4', t.is_active ? m.iconColor : 'text-muted-foreground')} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{t.name}</p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{m.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.message}</p>
                      {t.last_ran_at && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Last ran: {new Date(t.last_ran_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                        </p>
                      )}
                      {/* Webhook URL for abandoned_cart */}
                      {t.trigger_type === 'abandoned_cart' && (
                        <button
                          onClick={() => copyWebhookUrl(t)}
                          className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-purple-600 hover:text-purple-800"
                        >
                          {copiedId === t.id ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedId === t.id ? 'Copied!' : 'Copy webhook URL'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={t.is_active}
                      onCheckedChange={() => void handleToggle(t)}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => void handleDelete(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {(() => { const Icon = meta.icon; return <Icon className={cn('h-5 w-5', meta.iconColor)} />; })()}
              {editing ? 'Edit' : 'New'} {meta.label} Trigger
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Trigger Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Birthday Greeting" className="h-8 text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Message{' '}
                <span className="font-normal text-muted-foreground">
                  — use <code className="text-[10px] bg-muted px-1 rounded">{'{{name}}'}</code>
                  {formType === 'abandoned_cart' && <>, <code className="text-[10px] bg-muted px-1 rounded">{'{{cart_url}}'}</code></>}
                </span>
              </Label>
              <Textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                rows={4}
                className="text-sm resize-none"
              />
            </div>

            {/* Trigger-specific config fields */}
            {TRIGGER_META[formType].configFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs">{field.label}</Label>
                <Input
                  placeholder={field.placeholder}
                  value={formConfig[field.key] ?? ''}
                  onChange={(e) => setFormConfig((p) => ({ ...p, [field.key]: e.target.value }))}
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">{field.hint}</p>
              </div>
            ))}

            {/* Help text per trigger type */}
            <div className={cn('rounded-lg border px-3 py-2.5 text-xs', meta.color)}>
              {formType === 'birthday' && '📅 Runs daily at midnight IST. Contacts need a custom date field (e.g. "birthday") set in their profile.'}
              {formType === 're_engagement' && '🔄 Runs daily. Skips contacts already messaged by this trigger within the inactive period.'}
              {formType === 'abandoned_cart' && '🛒 Fires when your store calls the webhook. Copy the webhook URL after saving and paste it in your Shopify/WooCommerce settings.'}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="bg-brand-500 hover:bg-brand-600">
              {saving ? 'Saving…' : editing ? 'Update Trigger' : 'Create Trigger'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

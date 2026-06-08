'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Copy, Trash2, Pencil, CheckCircle2, ExternalLink,
  BarChart2, MessageCircle, Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { APP_URL } from '@/lib/constants';

interface ChatWidget {
  id: string;
  embed_key: string;
  name: string;
  is_active: boolean;
  phone_number: string;
  prefill_message: string;
  greeting_text: string;
  business_name: string;
  avatar_url?: string;
  button_color: string;
  position: 'bottom-right' | 'bottom-left';
  button_label: string;
  show_label: boolean;
  total_clicks: number;
  created_at: string;
}

type FormState = Omit<ChatWidget, 'id' | 'embed_key' | 'total_clicks' | 'created_at'>;

const DEFAULTS: FormState = {
  name:            'Website Widget',
  is_active:       true,
  phone_number:    '',
  prefill_message: 'Hello! I have a question.',
  greeting_text:   'Hi there 👋 How can we help you?',
  business_name:   'Support',
  avatar_url:      '',
  button_color:    '#25D366',
  position:        'bottom-right',
  button_label:    'Chat with us',
  show_label:      true,
};

const COLORS = ['#25D366', '#128C7E', '#1877F2', '#7C3AED', '#F59E0B', '#EF4444', '#111827'];

function WidgetPreview({ form }: { form: FormState }) {
  const [open, setOpen] = useState(false);
  const isRight = form.position === 'bottom-right';

  return (
    <div className="relative w-full h-52 rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden">
      <p className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground font-medium">Preview</p>

      {/* Popup */}
      {open && (
        <div
          className={cn(
            'absolute bottom-14 rounded-2xl bg-white shadow-xl p-3 w-48',
            isRight ? 'right-2' : 'left-2',
          )}
          style={{ animation: 'none' }}
        >
          <button onClick={() => setOpen(false)} className="absolute top-2 right-2.5 text-gray-400 text-sm leading-none">&times;</button>
          <div className="flex items-center gap-2 mb-2">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: form.button_color }}
            >
              {form.business_name?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">{form.business_name || 'Support'}</p>
              <p className="text-[10px] text-green-600">● Online</p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-2 leading-snug">{form.greeting_text || 'How can we help?'}</p>
          <div
            className="text-center text-xs text-white font-semibold rounded-lg py-1.5"
            style={{ background: form.button_color }}
          >
            Open WhatsApp →
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="absolute bottom-3 flex items-center gap-2 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{
          right:      isRight ? 10 : 'auto',
          left:       isRight ? 'auto' : 10,
          background: form.button_color,
          padding:    form.show_label ? '8px 14px' : '10px',
        }}
      >
        <MessageCircle className="h-4 w-4 text-white" />
        {form.show_label && (
          <span className="text-white text-xs font-semibold whitespace-nowrap">
            {form.button_label || 'Chat with us'}
          </span>
        )}
      </button>
    </div>
  );
}

export function ChatWidgetSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient = useQueryClient();
  const [editing,   setEditing]   = useState<ChatWidget | null>(null);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState<FormState>(DEFAULTS);
  const [saving,    setSaving]    = useState(false);
  const [copied,    setCopied]    = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['chat-widgets', workspaceId],
    queryFn:  async () => {
      const res = await fetch(`/api/chat-widgets?workspaceId=${workspaceId}`);
      if (!res.ok) return { widgets: [] };
      return res.json() as Promise<{ widgets: ChatWidget[] }>;
    },
    enabled: !!workspaceId,
  });

  const widgets = data?.widgets ?? [];
  const set = (k: keyof FormState, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  function openNew() {
    setEditing(null);
    setForm(DEFAULTS);
    setShowForm(true);
  }

  function openEdit(w: ChatWidget) {
    setEditing(w);
    setForm({
      name:            w.name,
      is_active:       w.is_active,
      phone_number:    w.phone_number,
      prefill_message: w.prefill_message,
      greeting_text:   w.greeting_text,
      business_name:   w.business_name,
      avatar_url:      w.avatar_url ?? '',
      button_color:    w.button_color,
      position:        w.position,
      button_label:    w.button_label,
      show_label:      w.show_label,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.phone_number.trim()) { toast.error('Phone number required'); return; }
    setSaving(true);
    try {
      const body = { ...form, workspaceId, avatar_url: form.avatar_url || undefined };
      const url    = editing ? `/api/chat-widgets/${editing.id}` : '/api/chat-widgets';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { toast.error('Save failed'); return; }
      toast.success(editing ? 'Widget updated!' : 'Widget created!');
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: ['chat-widgets', workspaceId] });
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this widget?')) return;
    await fetch(`/api/chat-widgets/${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    void queryClient.invalidateQueries({ queryKey: ['chat-widgets', workspaceId] });
  }

  async function handleToggle(w: ChatWidget) {
    await fetch(`/api/chat-widgets/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !w.is_active }),
    });
    void queryClient.invalidateQueries({ queryKey: ['chat-widgets', workspaceId] });
  }

  function copyEmbed(key: string) {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : APP_URL;
    const code = `<script src="${baseUrl}/api/widget/${key}/embed.js"></script>`;
    void navigator.clipboard.writeText(code);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Embed code copied!');
  }

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Chat Widget</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Add a floating WhatsApp button to any website with one line of code.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" className="gap-1.5 bg-brand-500 hover:bg-brand-600" onClick={openNew}>
            <Plus className="h-4 w-4" /> New Widget
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: form fields */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Widget Name</Label>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">WhatsApp Number <span className="text-destructive">*</span></Label>
                <Input placeholder="+919876543210" value={form.phone_number} onChange={(e) => set('phone_number', e.target.value)} className="h-8 text-sm font-mono" />
                <p className="text-[10px] text-muted-foreground">E.164 format with country code</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Business Name</Label>
                <Input value={form.business_name} onChange={(e) => set('business_name', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Greeting Text</Label>
                <Textarea value={form.greeting_text} onChange={(e) => set('greeting_text', e.target.value)} rows={2} className="text-sm resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pre-filled Message</Label>
                <Input value={form.prefill_message} onChange={(e) => set('prefill_message', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Button Label</Label>
                <Input value={form.button_label} onChange={(e) => set('button_label', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Position</Label>
                  <div className="flex gap-2">
                    {(['bottom-right', 'bottom-left'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => set('position', p)}
                        className={cn('flex-1 text-xs rounded-lg border py-1.5 font-medium transition-colors', form.position === p ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-border text-muted-foreground hover:border-brand-300')}
                      >
                        {p === 'bottom-right' ? '↘ Right' : '↙ Left'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Show Label</Label>
                  <div className="flex items-center gap-2 h-8">
                    <Switch checked={form.show_label} onCheckedChange={(v) => set('show_label', v)} />
                    <span className="text-xs text-muted-foreground">{form.show_label ? 'Visible' : 'Icon only'}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Button Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => set('button_color', c)}
                      className={cn('h-7 w-7 rounded-full border-2 transition-transform hover:scale-110', form.button_color === c ? 'border-foreground scale-110' : 'border-transparent')}
                      style={{ background: c }}
                    />
                  ))}
                  <Input
                    type="color"
                    value={form.button_color}
                    onChange={(e) => set('button_color', e.target.value)}
                    className="h-7 w-10 p-0.5 rounded-full border-2 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Right: live preview */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live Preview</p>
              <WidgetPreview form={form} />
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex gap-2">
                <Smartphone className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                <p>Click the preview button to see the popup. The real widget appears on your website.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" className="bg-brand-500 hover:bg-brand-600" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update Widget' : 'Create Widget'}
            </Button>
          </div>
        </div>
      )}

      {/* Widget list */}
      {widgets.length === 0 && !showForm ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No widgets yet</p>
          <p className="text-xs mt-1">Create a widget and add it to your website in seconds.</p>
        </div>
      ) : (
        !showForm && widgets.map((w) => (
          <div key={w.id} className={cn('rounded-xl border p-4 space-y-3', !w.is_active && 'opacity-60 bg-muted/20')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: w.button_color }}>
                  {w.business_name?.[0]?.toUpperCase() ?? 'W'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{w.name}</p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{w.position}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{w.phone_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <BarChart2 className="h-3.5 w-3.5" />
                  {w.total_clicks} clicks
                </div>
                <Switch checked={w.is_active} onCheckedChange={() => void handleToggle(w)} />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(w)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => void handleDelete(w.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Embed code */}
            <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Embed Code</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono text-foreground truncate bg-background rounded px-2 py-1.5 border border-border">
                  {`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/api/widget/${w.embed_key}/embed.js"></script>`}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 shrink-0 text-xs"
                  onClick={() => copyEmbed(w.embed_key)}
                >
                  {copied === w.embed_key
                    ? <><CheckCircle2 className="h-3 w-3 text-green-500" /> Copied!</>
                    : <><Copy className="h-3 w-3" /> Copy</>}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" asChild>
                  <a href={`/api/widget/${w.embed_key}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Paste this before the closing <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> tag on your website.</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

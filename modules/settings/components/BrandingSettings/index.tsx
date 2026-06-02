'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Palette, Globe, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/services/supabase/client';

const PRESET_COLORS = [
  { label: 'Indigo',   value: '#6366f1' },
  { label: 'Blue',     value: '#3b82f6' },
  { label: 'Emerald',  value: '#10b981' },
  { label: 'Rose',     value: '#f43f5e' },
  { label: 'Amber',    value: '#f59e0b' },
  { label: 'Purple',   value: '#a855f7' },
  { label: 'Slate',    value: '#64748b' },
  { label: 'Black',    value: '#0f172a' },
];

export function BrandingSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient  = useQueryClient();
  const [brandColor,    setBrandColor]    = useState('#6366f1');
  const [customDomain,  setCustomDomain]  = useState('');
  const [widgetUrl,     setWidgetUrl]     = useState('');

  const { data: ws, isLoading } = useQuery({
    queryKey: ['workspace-branding', workspaceId],
    queryFn:  () =>
      fetch(`/api/settings/workspace?workspaceId=${workspaceId}`)
        .then((r) => r.json() as Promise<{ workspace?: Record<string, unknown> }>),
    enabled: !!workspaceId,
  });

  useEffect(() => {
    if (ws?.workspace) {
      setBrandColor((ws.workspace.brand_color as string | null) ?? '#6366f1');
      setCustomDomain((ws.workspace.custom_domain as string | null) ?? '');
      setWidgetUrl(`${window.location.origin}/widget/${workspaceId}`);
    }
  }, [ws, workspaceId]);

  const save = useMutation({
    mutationFn: async () => {
      const supabase = createClient() as any;
      const { error } = await supabase
        .from('workspaces')
        .update({ brand_color: brandColor, custom_domain: customDomain.trim() || null })
        .eq('id', workspaceId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-branding', workspaceId] });
      toast.success('Branding saved');
    },
  });

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Palette className="h-4 w-4 text-purple-500" /> White Label & Branding
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Customize your workspace appearance and embed the chat widget on your website.</p>
      </div>

      {/* Brand Color */}
      <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
        <p className="text-sm font-medium">Brand Color</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setBrandColor(c.value)}
              title={c.label}
              className={`h-8 w-8 rounded-full border-2 transition-all ${
                brandColor === c.value ? 'border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20' : 'border-transparent'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            className="h-8 w-8 rounded cursor-pointer border border-border"
          />
          <Input
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            className="w-32 font-mono text-sm"
            placeholder="#6366f1"
          />
          <div className="flex-1 h-8 rounded-lg border border-border" style={{ backgroundColor: brandColor }} />
        </div>
      </div>

      {/* Custom Domain */}
      <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Custom Domain</p>
        </div>
        <Input
          value={customDomain}
          onChange={(e) => setCustomDomain(e.target.value)}
          placeholder="app.yourdomain.com"
        />
        <p className="text-xs text-muted-foreground">Point your domain CNAME to <code className="bg-muted px-1 py-0.5 rounded text-xs">cname.vercel-dns.com</code></p>
      </div>

      {/* Web Chat Widget */}
      <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
        <p className="text-sm font-medium">Web Chat Widget</p>
        <p className="text-xs text-muted-foreground">Embed this on any website. Visitors click the button → WhatsApp chat opens.</p>
        {widgetUrl && (
          <div className="space-y-2">
            <Label className="text-xs">Widget URL</Label>
            <div className="flex gap-2">
              <Input value={widgetUrl} readOnly className="text-xs font-mono" />
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5 text-xs"
                onClick={() => { void navigator.clipboard.writeText(widgetUrl); toast.success('Copied!'); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="shrink-0" asChild>
                <a href={widgetUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
              </Button>
            </div>
            <Label className="text-xs">Embed Script</Label>
            <div className="bg-muted rounded-lg p-3 text-xs font-mono break-all text-muted-foreground">
              {`<iframe src="${widgetUrl}" width="340" height="260" frameborder="0" style="border:none;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12)"></iframe>`}
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs w-full"
              onClick={() => {
                const script = `<iframe src="${widgetUrl}" width="340" height="260" frameborder="0" style="border:none;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12)"></iframe>`;
                void navigator.clipboard.writeText(script);
                toast.success('Embed code copied!');
              }}>
              <Copy className="h-3.5 w-3.5" /> Copy Embed Code
            </Button>
          </div>
        )}
      </div>

      <Button onClick={() => void save.mutate()} disabled={save.isPending} className="gap-1.5">
        <Palette className="h-4 w-4" />
        {save.isPending ? 'Saving…' : 'Save Branding'}
      </Button>
    </div>
  );
}

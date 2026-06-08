'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { IndianRupee, Eye, EyeOff, ShoppingCart, Copy, CheckCircle2, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';

interface WorkspaceSettings {
  razorpay_key_id?: string;
  razorpay_key_secret?: string;
  shopify_webhook_secret?: string;
  shopify_events?: Record<string, boolean>;
  shopify_messages?: Record<string, string>;
}

const SHOPIFY_EVENTS = [
  { key: 'orders_create',    topic: 'orders/create',    label: 'Order Confirmed',   desc: 'When a new order is placed' },
  { key: 'orders_paid',      topic: 'orders/paid',      label: 'Payment Received',  desc: 'When payment is confirmed' },
  { key: 'orders_fulfilled', topic: 'orders/fulfilled', label: 'Order Shipped',     desc: 'When order is shipped with tracking' },
  { key: 'orders_cancelled', topic: 'orders/cancelled', label: 'Order Cancelled',   desc: 'When order is cancelled' },
  { key: 'checkouts_create', topic: 'checkouts/create', label: 'Abandoned Cart',    desc: 'When checkout is started but not completed' },
];

const DEFAULT_MESSAGES: Record<string, string> = {
  orders_create:    'Hello {{name}}! 🛍️\n\nYour order *{{order_no}}* has been placed!\nTotal: *{{total}}*\n\nWe\'ll notify you once it ships.',
  orders_paid:      '✅ Payment confirmed for order *{{order_no}}*!\nAmount: *{{total}}*\n\nThank you!',
  orders_fulfilled: '📦 Your order *{{order_no}}* has been shipped! Check your email for tracking details.',
  orders_cancelled: 'Hello {{name}}, your order *{{order_no}}* has been cancelled. Contact us if you need help.',
  checkouts_create: 'Hi {{name}}! 🛒 You left items in your cart. Complete your purchase before they sell out!',
};

export function IntegrationSettings() {
  const workspace   = useWorkspaceStore((s) => s.activeWorkspace);
  const [loaded,    setLoaded]    = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [showShopify, setShowShopify] = useState(false);

  // Razorpay
  const [keyId,      setKeyId]      = useState('');
  const [keySecret,  setKeySecret]  = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [savingRzp,  setSavingRzp]  = useState(false);

  // Shopify
  const [shopifySecret,   setShopifySecret]   = useState('');
  const [shopifyEvents,   setShopifyEvents]   = useState<Record<string, boolean>>({});
  const [shopifyMessages, setShopifyMessages] = useState<Record<string, string>>(DEFAULT_MESSAGES);
  const [savingShopify,   setSavingShopify]   = useState(false);
  const [expandedEvent,   setExpandedEvent]   = useState<string | null>(null);

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/integrations/shopify?workspaceId=${workspace?.id ?? 'YOUR_WORKSPACE_ID'}`
    : `/api/integrations/shopify?workspaceId=${workspace?.id ?? 'YOUR_WORKSPACE_ID'}`;

  useEffect(() => {
    if (!workspace?.id || loaded) return;
    fetch(`/api/settings/workspace?workspaceId=${workspace.id}`)
      .then(r => r.json())
      .then((data: { workspace?: { settings?: WorkspaceSettings } }) => {
        const s = data.workspace?.settings ?? {};
        setKeyId(s.razorpay_key_id ?? '');
        setKeySecret(s.razorpay_key_secret ?? '');
        setShopifySecret(s.shopify_webhook_secret ?? '');
        setShopifyEvents(s.shopify_events ?? {});
        setShopifyMessages({ ...DEFAULT_MESSAGES, ...(s.shopify_messages ?? {}) });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [workspace?.id, loaded]);

  const handleSaveRzp = async () => {
    if (!workspace?.id) return;
    setSavingRzp(true);
    try {
      const settings: WorkspaceSettings = { razorpay_key_id: keyId };
      if (keySecret && keySecret !== '••••••••') settings.razorpay_key_secret = keySecret;
      const r = await fetch('/api/settings/workspace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id, settings }) });
      if (!r.ok) throw new Error('Failed');
      toast.success('Razorpay keys saved');
    } catch { toast.error('Save failed'); }
    finally { setSavingRzp(false); }
  };

  const handleSaveShopify = async () => {
    if (!workspace?.id) return;
    setSavingShopify(true);
    try {
      const settings: WorkspaceSettings = {
        shopify_webhook_secret: shopifySecret,
        shopify_events:         shopifyEvents,
        shopify_messages:       shopifyMessages,
      };
      const r = await fetch('/api/settings/workspace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id, settings }) });
      if (!r.ok) throw new Error('Failed');
      toast.success('Shopify settings saved');
    } catch { toast.error('Save failed'); }
    finally { setSavingShopify(false); }
  };

  function copyUrl() {
    void navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Webhook URL copied!');
  }

  const rzpConfigured = !!(keyId && keySecret);
  const shopifyConfigured = !!shopifySecret;
  const enabledCount = SHOPIFY_EVENTS.filter(e => shopifyEvents[e.key] !== false).length;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect Razorpay, Shopify, and other services.</p>
      </div>

      {/* ── Razorpay ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-border bg-muted flex items-center justify-center shrink-0">
            <IndianRupee className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Razorpay</p>
            <p className="text-xs text-muted-foreground">Send payment links directly in conversations</p>
          </div>
          <Badge className={rzpConfigured ? 'bg-green-100 text-green-700 text-xs' : 'bg-muted text-muted-foreground text-xs'}>
            {rzpConfigured ? 'Connected' : 'Not configured'}
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">API Key ID</Label>
            <Input value={keyId} onChange={e => setKeyId(e.target.value)} placeholder="rzp_live_…" className="h-8 text-sm font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">API Key Secret</Label>
            <div className="relative">
              <Input type={showSecret ? 'text' : 'password'} value={keySecret} onChange={e => setKeySecret(e.target.value)} placeholder="Your Razorpay secret key" className="h-8 text-sm font-mono pr-9" />
              <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowSecret(v => !v)}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button size="sm" onClick={() => void handleSaveRzp()} disabled={savingRzp || !keyId}>
            {savingRzp ? 'Saving…' : 'Save Razorpay Keys'}
          </Button>
        </div>
      </div>

      <Separator />

      {/* ── Shopify ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-5 w-5 text-green-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Shopify</p>
            <p className="text-xs text-muted-foreground">Auto-send WhatsApp messages on orders, shipping, and abandoned carts. Syncs customers as contacts.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={shopifyConfigured ? 'bg-green-100 text-green-700 text-xs' : 'bg-muted text-muted-foreground text-xs'}>
              {shopifyConfigured ? `${enabledCount} events active` : 'Not configured'}
            </Badge>
            <button onClick={() => setShowShopify(v => !v)} className="text-muted-foreground hover:text-foreground">
              {showShopify ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {showShopify && (
          <div className="space-y-4 pt-1">
            {/* Webhook URL */}
            <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Webhook URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono truncate bg-background rounded px-2 py-1.5 border border-border">
                  {webhookUrl}
                </code>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0" onClick={copyUrl}>
                  {copied ? <><CheckCircle2 className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                </Button>
              </div>
            </div>

            {/* Setup steps */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Setup in Shopify Admin:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                <li>Settings → Notifications → Webhooks → Create webhook</li>
                <li>Select event, paste the URL above, format: JSON</li>
                <li>Copy "Your signing secret" from Shopify and paste below</li>
                <li>Repeat for each event you want to enable</li>
              </ol>
              <a href="https://help.shopify.com/en/manual/orders/notifications/webhooks" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2 mt-1">
                Shopify webhook docs <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Webhook secret */}
            <div className="space-y-1.5">
              <Label className="text-xs">Shopify Signing Secret</Label>
              <Input value={shopifySecret} onChange={e => setShopifySecret(e.target.value)} placeholder="shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="h-8 text-sm font-mono" />
              <p className="text-[10px] text-muted-foreground">Found in Shopify Admin → Settings → Notifications → Webhooks (at the top)</p>
            </div>

            {/* Event toggles + custom messages */}
            <div className="space-y-2">
              <p className="text-xs font-semibold">Events & Message Templates</p>
              <p className="text-[10px] text-muted-foreground mb-2">
                Variables: <code className="bg-muted px-1 rounded">{'{{name}}'}</code> <code className="bg-muted px-1 rounded">{'{{order_no}}'}</code> <code className="bg-muted px-1 rounded">{'{{total}}'}</code>
              </p>
              {SHOPIFY_EVENTS.map(ev => {
                const isEnabled  = shopifyEvents[ev.key] !== false;
                const isExpanded = expandedEvent === ev.key;
                return (
                  <div key={ev.key} className={cn('rounded-xl border border-border transition-colors', isEnabled ? 'bg-card' : 'bg-muted/30 opacity-60')}>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={v => setShopifyEvents(p => ({ ...p, [ev.key]: v }))}
                        className="scale-90"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{ev.label}</p>
                        <p className="text-[10px] text-muted-foreground">{ev.desc} · <code className="bg-muted px-1 rounded">{ev.topic}</code></p>
                      </div>
                      {isEnabled && (
                        <button onClick={() => setExpandedEvent(isExpanded ? null : ev.key)} className="text-[11px] text-brand-500 hover:text-brand-600 font-medium shrink-0">
                          {isExpanded ? 'Hide message ↑' : 'Edit message ↓'}
                        </button>
                      )}
                    </div>
                    {isExpanded && isEnabled && (
                      <div className="px-3 pb-3">
                        <Textarea
                          value={shopifyMessages[ev.key] ?? DEFAULT_MESSAGES[ev.key] ?? ''}
                          onChange={e => setShopifyMessages(p => ({ ...p, [ev.key]: e.target.value }))}
                          rows={3}
                          className="text-xs resize-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Button size="sm" className="bg-brand-500 hover:bg-brand-600" onClick={() => void handleSaveShopify()} disabled={savingShopify}>
              {savingShopify ? 'Saving…' : 'Save Shopify Settings'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

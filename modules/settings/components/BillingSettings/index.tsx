'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Zap, Building2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { RAZORPAY_PLANS as STRIPE_PLANS } from '@/lib/razorpay-billing';
import { cn } from '@/lib/utils';

interface PlanLimits { agents: number; messages_per_month: number; campaigns_per_month: number; kb_entries: number }
interface WorkspaceData { plan: string; plan_limits: PlanLimits; stripe_customer_id: string | null }
interface UsageMetric { used: number; limit: number; pct: number }
interface UsageResponse {
  plan: string;
  month: string;
  usage: { messages: UsageMetric; contacts: UsageMetric; campaigns: UsageMetric };
}

export function BillingSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [loading, setLoading] = useState<string | null>(null);

  const { data: ws, isLoading } = useQuery({
    queryKey: ['workspace-billing', workspaceId],
    queryFn:  () =>
      fetch(`/api/settings/workspace?workspaceId=${workspaceId}`)
        .then((r) => r.json() as Promise<{ workspace?: WorkspaceData }>),
    enabled: !!workspaceId,
  });

  const { data: usageData } = useQuery({
    queryKey: ['workspace-usage', workspaceId],
    queryFn: () =>
      fetch(`/api/billing/usage?workspaceId=${workspaceId}`)
        .then((r) => r.json() as Promise<UsageResponse>),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });

  const currentPlan = (ws?.workspace?.plan ?? 'free') as string;

  const handleUpgrade = async (plan: 'pro' | 'enterprise') => {
    setLoading(plan);
    try {
      const res = await fetch('/api/billing/razorpay-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, plan }),
      });
      const data = await res.json() as { checkoutUrl?: string; error?: string };
      if (data.error) { toast.error(data.error); return; }
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch {
      toast.error('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;

  const fmt = (v: number) => v === -1 ? 'Unlimited' : v.toLocaleString();

  // Starter plan data (not in RAZORPAY_PLANS, defined inline)
  const STARTER_PLAN = { name: 'Starter', price: 1499 };

  const plans = [
    {
      key: 'starter' as const,
      displayKey: ['free', 'starter'] as string[],
      icon: Zap,
      color: 'border-gray-200',
      badge: 'bg-gray-100 text-gray-600',
      name: STARTER_PLAN.name,
      price: STARTER_PLAN.price,
      features: ['3 agents', '1,000 messages/mo', '5 campaigns/mo', '50 KB entries', 'All core features'],
    },
    {
      key: 'pro' as const,
      displayKey: ['pro'] as string[],
      icon: CreditCard,
      color: 'border-brand-300 ring-1 ring-brand-200',
      badge: 'bg-brand-100 text-brand-700',
      name: STRIPE_PLANS.pro.name,
      price: STRIPE_PLANS.pro.price,
      features: ['10 agents', '25,000 messages/mo', '50 campaigns/mo', '500 KB entries', 'Priority support', 'A/B Testing', 'AI features'],
      recommended: true,
    },
    {
      key: 'enterprise' as const,
      displayKey: ['enterprise'] as string[],
      icon: Building2,
      color: 'border-purple-200',
      badge: 'bg-purple-100 text-purple-700',
      name: STRIPE_PLANS.enterprise.name,
      price: STRIPE_PLANS.enterprise.price,
      features: ['Unlimited agents', 'Unlimited messages', 'Unlimited campaigns', 'Unlimited KB entries', 'White label', 'Custom domain', 'SLA support'],
    },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Billing & Plans</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Current plan: <span className="font-medium capitalize">{currentPlan}</span>
        </p>
      </div>

      {/* Usage this month */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Usage this month</p>
          <span className="text-xs text-muted-foreground">{usageData?.month ?? '...'}</span>
        </div>

        {/* Messages */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Messages</span>
            <span className={cn('font-medium', (usageData?.usage.messages.pct ?? 0) >= 90 ? 'text-red-600' : (usageData?.usage.messages.pct ?? 0) >= 70 ? 'text-amber-600' : 'text-foreground')}>
              {(usageData?.usage.messages.used ?? 0).toLocaleString()} / {(usageData?.usage.messages.limit ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', (usageData?.usage.messages.pct ?? 0) >= 90 ? 'bg-red-500' : (usageData?.usage.messages.pct ?? 0) >= 70 ? 'bg-amber-500' : 'bg-brand-500')}
              style={{ width: `${Math.min(usageData?.usage.messages.pct ?? 0, 100)}%` }}
            />
          </div>
        </div>

        {/* Contacts */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Contacts</span>
            <span className={cn('font-medium', (usageData?.usage.contacts.pct ?? 0) >= 90 ? 'text-red-600' : (usageData?.usage.contacts.pct ?? 0) >= 70 ? 'text-amber-600' : 'text-foreground')}>
              {(usageData?.usage.contacts.used ?? 0).toLocaleString()} / {(usageData?.usage.contacts.limit ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', (usageData?.usage.contacts.pct ?? 0) >= 90 ? 'bg-red-500' : (usageData?.usage.contacts.pct ?? 0) >= 70 ? 'bg-amber-500' : 'bg-brand-500')}
              style={{ width: `${Math.min(usageData?.usage.contacts.pct ?? 0, 100)}%` }}
            />
          </div>
        </div>

        {/* Campaigns */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Campaigns</span>
            <span className={cn('font-medium', (usageData?.usage.campaigns.pct ?? 0) >= 90 ? 'text-red-600' : (usageData?.usage.campaigns.pct ?? 0) >= 70 ? 'text-amber-600' : 'text-foreground')}>
              {(usageData?.usage.campaigns.used ?? 0).toLocaleString()} / {(usageData?.usage.campaigns.limit ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', (usageData?.usage.campaigns.pct ?? 0) >= 90 ? 'bg-red-500' : (usageData?.usage.campaigns.pct ?? 0) >= 70 ? 'bg-amber-500' : 'bg-brand-500')}
              style={{ width: `${Math.min(usageData?.usage.campaigns.pct ?? 0, 100)}%` }}
            />
          </div>
        </div>

        {((usageData?.usage.messages.pct ?? 0) >= 80 ||
          (usageData?.usage.contacts.pct ?? 0) >= 80 ||
          (usageData?.usage.campaigns.pct ?? 0) >= 80) && (
          <p className="text-xs text-amber-600 font-medium">
            ⚠️ You&apos;re approaching your monthly limit. Consider upgrading your plan.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {plans.map((p) => {
          const isActive = p.displayKey.includes(currentPlan);
          return (
            <div key={p.key} className={cn('rounded-xl border p-4 space-y-3 relative', p.color, isActive && 'bg-brand-50/50')}>
              {p.recommended && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500 text-white">
                  RECOMMENDED
                </span>
              )}
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{p.name}</p>
                {isActive && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">Active</Badge>}
              </div>
              <div>
                <span className="text-2xl font-bold">
                  {p.price === 0 ? 'Free' : `₹${p.price.toLocaleString()}`}
                </span>
                {p.price > 0 && <span className="text-xs text-muted-foreground">/month</span>}
              </div>
              <ul className="space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />{f}
                  </li>
                ))}
              </ul>
              {!isActive && p.key !== 'starter' && (
                <Button
                  size="sm"
                  className="w-full text-xs gap-1.5"
                  onClick={() => void handleUpgrade(p.key as 'pro' | 'enterprise')}
                  disabled={loading === p.key}
                >
                  {loading === p.key ? 'Redirecting…' : `Upgrade to ${p.name}`}
                </Button>
              )}
              {isActive && (
                <p className="text-[11px] text-center text-muted-foreground">Your current plan</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border p-4 bg-muted/30 text-xs text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground text-sm">How to activate paid plans (Razorpay):</p>
        <p>1. Razorpay dashboard → Subscriptions → Plans → Create <strong>Pro</strong> (₹2999/mo) &amp; <strong>Enterprise</strong> (₹9999/mo) plans.</p>
        <p>2. Add to Vercel env vars: <code className="bg-muted px-1 rounded">RAZORPAY_KEY_ID</code>, <code className="bg-muted px-1 rounded">RAZORPAY_KEY_SECRET</code>, <code className="bg-muted px-1 rounded">RAZORPAY_PRO_PLAN_ID</code>, <code className="bg-muted px-1 rounded">RAZORPAY_ENTERPRISE_PLAN_ID</code>, <code className="bg-muted px-1 rounded">RAZORPAY_WEBHOOK_SECRET</code></p>
        <p>3. Razorpay → Settings → Webhooks → Add: <code className="bg-muted px-1 rounded">/api/billing/razorpay-webhook</code></p>
        <p>4. Click Upgrade → Razorpay hosted page → pay → plan activates.</p>
      </div>
    </div>
  );
}

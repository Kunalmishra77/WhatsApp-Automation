'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Zap, Building2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { STRIPE_PLANS } from '@/lib/stripe';
import { cn } from '@/lib/utils';

interface PlanLimits { agents: number; messages_per_month: number; campaigns_per_month: number; kb_entries: number }
interface WorkspaceData { plan: string; plan_limits: PlanLimits; stripe_customer_id: string | null }

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

  const currentPlan = (ws?.workspace?.plan ?? 'free') as string;

  const handleUpgrade = async (plan: 'pro' | 'enterprise') => {
    setLoading(plan);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, plan }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.error) { toast.error(data.error); return; }
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;

  const fmt = (v: number) => v === -1 ? 'Unlimited' : v.toLocaleString();

  const plans = [
    {
      key: 'free' as const,
      icon: Zap,
      color: 'border-gray-200',
      badge: 'bg-gray-100 text-gray-600',
      features: ['3 agents', '1,000 messages/mo', '5 campaigns/mo', '50 KB entries', 'All core features'],
    },
    {
      key: 'pro' as const,
      icon: CreditCard,
      color: 'border-brand-300 ring-1 ring-brand-200',
      badge: 'bg-brand-100 text-brand-700',
      features: ['10 agents', '25,000 messages/mo', '50 campaigns/mo', '500 KB entries', 'Priority support', 'A/B Testing', 'AI features'],
      recommended: true,
    },
    {
      key: 'enterprise' as const,
      icon: Building2,
      color: 'border-purple-200',
      badge: 'bg-purple-100 text-purple-700',
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

      <div className="grid grid-cols-3 gap-4">
        {plans.map((p) => {
          const planData = STRIPE_PLANS[p.key];
          const isActive = currentPlan === p.key;
          return (
            <div key={p.key} className={cn('rounded-xl border p-4 space-y-3 relative', p.color, isActive && 'bg-brand-50/50')}>
              {p.recommended && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500 text-white">
                  RECOMMENDED
                </span>
              )}
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{planData.name}</p>
                {isActive && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">Active</Badge>}
              </div>
              <div>
                <span className="text-2xl font-bold">
                  {planData.price === 0 ? 'Free' : `₹${planData.price.toLocaleString()}`}
                </span>
                {planData.price > 0 && <span className="text-xs text-muted-foreground">/month</span>}
              </div>
              <ul className="space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />{f}
                  </li>
                ))}
              </ul>
              {!isActive && p.key !== 'free' && (
                <Button
                  size="sm"
                  className="w-full text-xs gap-1.5"
                  onClick={() => void handleUpgrade(p.key)}
                  disabled={loading === p.key}
                >
                  {loading === p.key ? 'Redirecting…' : `Upgrade to ${planData.name}`}
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
        <p className="font-medium text-foreground text-sm">How to activate paid plan:</p>
        <p>1. Add <code className="bg-muted px-1 rounded">STRIPE_SECRET_KEY</code>, <code className="bg-muted px-1 rounded">STRIPE_PRO_PRICE_ID</code>, and <code className="bg-muted px-1 rounded">STRIPE_WEBHOOK_SECRET</code> to Vercel environment variables.</p>
        <p>2. In Stripe dashboard, add webhook endpoint: <code className="bg-muted px-1 rounded">/api/billing/webhook</code></p>
        <p>3. Click Upgrade → complete Stripe Checkout → plan activates automatically.</p>
      </div>
    </div>
  );
}

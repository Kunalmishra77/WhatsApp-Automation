'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera, RefreshCw } from 'lucide-react';
import { rupees, TERMS, type Term } from '@/lib/billing';
import { cn } from '@/lib/utils';
import { CheckoutButton } from './CheckoutButton';
import { BillingHistory } from './BillingHistory';
import { TermSelector, type PriceMatrixRow } from './TermSelector';
import { Countdown } from './Countdown';

type SubStatus = 'pending' | 'active' | 'past_due' | 'suspended' | 'cancelled';

interface StatusSubscription {
  plan_key: string;
  status: SubStatus;
  mode: 'auto' | 'manual';
  has_instagram: boolean;
  term: Term;
  current_period_start: string | null;
  current_period_end: string | null;
}
interface StatusPlan {
  key: string;
  name: string;
  base_paise: number;
  gst_paise: number;
  total_paise: number;
}
interface StatusPayment {
  invoice_no: string | null;
  total_paise: number;
  status: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
}
interface StatusResponse {
  subscription: StatusSubscription | null;
  plan: StatusPlan;
  plans: StatusPlan[];
  price_matrix: PriceMatrixRow[];
  payments: StatusPayment[];
}

const STATUS_BADGE: Record<SubStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-0' },
  past_due: { label: 'Past Due', className: 'bg-amber-100 text-amber-700 border-0' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-700 border-0' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-600 border-0' },
  pending: { label: 'Pending', className: 'bg-blue-100 text-blue-700 border-0' },
};

function formatDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function BillingSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['billing-status', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/status?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error('Failed to load billing status');
      return res.json() as Promise<StatusResponse>;
    },
    enabled: !!workspaceId,
  });

  // Local toggle for the Instagram add-on and the selected billing term. Both are
  // seeded once from the subscription's current values (defaults if there's no
  // subscription yet). Changing them only changes what the *next* checkout charges
  // for — neither is applied on its own.
  const [hasInstagram, setHasInstagram] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<Term>('monthly');
  const seededRef = useRef(false);
  useEffect(() => {
    if (data && !seededRef.current) {
      setHasInstagram(data.subscription?.has_instagram ?? false);
      setSelectedTerm(data.subscription?.term ?? 'monthly');
      seededRef.current = true;
    }
  }, [data]);

  function handleRefreshAfterPayment() {
    seededRef.current = false; // re-seed the toggle from the freshly-paid subscription
    void refetch();
    // The auto-pay webhook can land a beat after Checkout's handler fires, so poll
    // a couple more times to pick up the status flip without a manual refresh.
    setTimeout(() => void refetch(), 3000);
    setTimeout(() => void refetch(), 8000);
  }

  if (!workspaceId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to view billing.</p>;
  }

  if (isLoading) {
    return (
      <div className="space-y-3 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
        <span>Could not load billing information.</span>
        <button type="button" onClick={() => void refetch()} className="underline font-medium">
          Retry
        </button>
      </div>
    );
  }

  const { subscription, plans, price_matrix, payments } = data;
  const status: SubStatus = subscription?.status ?? 'pending';
  const badge = subscription ? STATUS_BADGE[status] : { label: 'No active plan', className: 'bg-gray-100 text-gray-600 border-0' };
  const igAddOnPlan = plans.find((p) => p.key === 'whatsapp_instagram');
  const baseOnlyPlan = plans.find((p) => p.key === 'whatsapp');
  const igAddOnPaise = igAddOnPlan && baseOnlyPlan ? igAddOnPlan.base_paise - baseOnlyPlan.base_paise : null;
  const isAutoPay = subscription?.mode === 'auto';

  // Term selector + offer preview, scoped to whichever channel the Instagram toggle
  // currently reflects — switching the toggle recomputes this without a refetch.
  const channelKey = hasInstagram ? 'whatsapp_instagram' : 'whatsapp';
  const channelRows = price_matrix.filter((r) => r.key === channelKey);
  const selectedRow = channelRows.find((r) => r.term === selectedTerm) ?? channelRows[0] ?? null;
  const selectedOfferSavings =
    selectedRow?.original_total_paise != null && selectedRow.original_total_paise > selectedRow.total_paise
      ? selectedRow.original_total_paise - selectedRow.total_paise
      : null;

  // Header label tracks the live channel + selected term (not the legacy
  // monthly-only plan name) so it doesn't still say "Monthly" after picking
  // a different term below.
  const channelLabel = hasInstagram ? 'WhatsApp + Instagram' : 'WhatsApp';
  const planHeaderLabel = selectedRow ? `${channelLabel} — ${TERMS[selectedRow.term].label}` : channelLabel;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Billing</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your subscription and payment method.</p>
      </div>

      {/* Plan, status, GST breakdown, next billing date */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{planHeaderLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{isAutoPay ? 'Auto-pay' : 'Manual billing'}</p>
          </div>
          <Badge className={cn('text-xs', badge.className)}>{badge.label}</Badge>
        </div>

        <TermSelector rows={channelRows} value={selectedTerm} onChange={setSelectedTerm} />

        {selectedRow && (
          <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span>Total ({TERMS[selectedRow.term].label}, GST incl.)</span>
              <span className="flex items-center gap-2">
                {selectedOfferSavings != null && (
                  <s className="text-xs font-normal text-muted-foreground/70">
                    ₹{rupees(selectedRow.original_total_paise as number)}
                  </s>
                )}
                ₹{rupees(selectedRow.total_paise)}
              </span>
            </div>
            {selectedOfferSavings != null && (
              <div className="flex justify-end">
                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">
                  Save ₹{rupees(selectedOfferSavings)}
                </Badge>
              </div>
            )}
          </div>
        )}

        {subscription?.current_period_end && (
          <Countdown
            periodEnd={subscription.current_period_end}
            nextBillingLabel={formatDate(subscription.current_period_end)}
          />
        )}
      </div>

      {/* Instagram add-on */}
      <div className="rounded-xl border border-border p-4 flex items-center justify-between">
        <div className="flex items-start gap-3">
          <Camera className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Instagram add-on</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {igAddOnPaise != null ? `+₹${rupees(igAddOnPaise)}/month for Instagram automation` : 'Add Instagram automation to your plan'}
            </p>
          </div>
        </div>
        <Switch checked={hasInstagram} onCheckedChange={setHasInstagram} />
      </div>

      {/* Payment mode + actions */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Auto-pay</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAutoPay
                ? 'Your card is charged automatically each billing cycle.'
                : 'Currently on manual billing — pay each cycle yourself, or switch to auto-pay.'}
            </p>
          </div>
          <Badge
            className={cn(
              'text-xs border-0',
              isAutoPay ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600',
            )}
          >
            {isAutoPay ? 'On' : 'Off'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CheckoutButton
            workspaceId={workspaceId}
            hasInstagram={hasInstagram}
            mode="manual"
            term={selectedTerm}
            label={selectedRow ? `Pay Now — ₹${rupees(selectedRow.total_paise)}` : 'Pay Now'}
            busyLabel="Opening payment…"
            onSuccess={handleRefreshAfterPayment}
            disabled={!selectedRow}
          />
          {!isAutoPay && (
            <CheckoutButton
              workspaceId={workspaceId}
              hasInstagram={hasInstagram}
              mode="auto"
              term={selectedTerm}
              label="Enable auto-pay"
              busyLabel="Opening payment…"
              variant="outline"
              onSuccess={handleRefreshAfterPayment}
              disabled={!selectedRow}
            />
          )}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Refresh status
          </button>
        </div>
      </div>

      {/* Billing history */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Billing history</p>
        <BillingHistory payments={payments} />
      </div>
    </div>
  );
}

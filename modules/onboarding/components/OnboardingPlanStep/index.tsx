'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera, MessageSquare } from 'lucide-react';
import { rupees, TERMS, type Term } from '@/lib/billing';
import { CheckoutButton } from '@/modules/settings/components/BillingSettings/CheckoutButton';
import { TermSelector, type PriceMatrixRow } from '@/modules/settings/components/BillingSettings/TermSelector';

interface StatusPlan {
  key: string;
  name: string;
  base_paise: number;
  gst_paise: number;
  total_paise: number;
}
interface StatusResponse {
  plans: StatusPlan[];
  price_matrix: PriceMatrixRow[];
}

interface OnboardingPlanStepProps {
  workspaceId: string;
}

// Final self-serve onboarding step: pick the WhatsApp plan (+ optional Instagram
// add-on) and a billing term, then pay to activate the workspace. Reuses the same
// billing_plans-backed pricing + Billing-v2 CheckoutButton/TermSelector the
// Settings > Billing page uses — no separate checkout logic here.
export function OnboardingPlanStep({ workspaceId }: OnboardingPlanStepProps) {
  const router = useRouter();

  const [hasInstagram, setHasInstagram] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<Term>('monthly');
  // True once checkout has failed to even start (e.g. the payment gateway isn't
  // configured yet). Razorpay Live keys are pending — until they land, checkout
  // reliably 4xx/5xxs before the modal opens, so this is expected right now.
  const [checkoutPending, setCheckoutPending] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['onboarding-billing-status', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/status?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error('Failed to load plan pricing');
      return res.json() as Promise<StatusResponse>;
    },
    enabled: !!workspaceId,
  });

  function clearPending() {
    setCheckoutPending(false);
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </Shell>
    );
  }

  if (isError || !data) {
    return (
      <Shell>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
          <span>Could not load plan pricing.</span>
          <button type="button" onClick={() => void refetch()} className="underline font-medium">
            Retry
          </button>
        </div>
      </Shell>
    );
  }

  const { plans, price_matrix } = data;
  const igAddOnPlan = plans.find((p) => p.key === 'whatsapp_instagram');
  const baseOnlyPlan = plans.find((p) => p.key === 'whatsapp');
  const igAddOnPaise = igAddOnPlan && baseOnlyPlan ? igAddOnPlan.base_paise - baseOnlyPlan.base_paise : null;

  const channelKey = hasInstagram ? 'whatsapp_instagram' : 'whatsapp';
  const channelRows = price_matrix.filter((r) => r.key === channelKey);
  const selectedRow = channelRows.find((r) => r.term === selectedTerm) ?? channelRows[0] ?? null;
  const offerSavings =
    selectedRow?.original_total_paise != null && selectedRow.original_total_paise > selectedRow.total_paise
      ? selectedRow.original_total_paise - selectedRow.total_paise
      : null;

  return (
    <Shell>
      <div className="space-y-5">
        <div className="rounded-xl border border-border p-4 flex items-start gap-3">
          <MessageSquare className="h-4 w-4 mt-0.5 text-brand-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">WhatsApp CRM</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI-powered inbox, campaigns, chatbot flows, and analytics on your own WhatsApp number.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Camera className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Instagram add-on</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {igAddOnPaise != null
                  ? `+₹${rupees(igAddOnPaise)}/month for Instagram automation`
                  : 'Add Instagram automation to your plan'}
              </p>
            </div>
          </div>
          <Switch
            checked={hasInstagram}
            onCheckedChange={(v) => {
              setHasInstagram(v);
              clearPending();
            }}
          />
        </div>

        <div className="rounded-xl border border-border p-4 space-y-4">
          <TermSelector
            rows={channelRows}
            value={selectedTerm}
            onChange={(t) => {
              setSelectedTerm(t);
              clearPending();
            }}
          />

          {selectedRow && (
            <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between font-semibold text-foreground">
                <span>Total ({TERMS[selectedRow.term].label}, GST incl.)</span>
                <span className="flex items-center gap-2">
                  {offerSavings != null && (
                    <s className="text-xs font-normal text-muted-foreground/70">
                      ₹{rupees(selectedRow.original_total_paise as number)}
                    </s>
                  )}
                  ₹{rupees(selectedRow.total_paise)}
                </span>
              </div>
              {offerSavings != null && (
                <div className="flex justify-end">
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">
                    Save ₹{rupees(offerSavings)}
                  </Badge>
                </div>
              )}
            </div>
          )}
        </div>

        {checkoutPending && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Payments are being activated — an admin will enable your account shortly.
          </div>
        )}

        <CheckoutButton
          workspaceId={workspaceId}
          hasInstagram={hasInstagram}
          mode="manual"
          term={selectedTerm}
          label={selectedRow ? `Pay & Activate — ₹${rupees(selectedRow.total_paise)}` : 'Pay & Activate'}
          busyLabel="Opening payment…"
          className="w-full"
          disabled={!selectedRow}
          onSuccess={() => router.push('/conversations')}
          onError={() => setCheckoutPending(true)}
        />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4 py-12">
      <div className="w-full max-w-lg animate-fade-in">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
              A
            </div>
            <span className="text-label font-semibold uppercase tracking-widest text-brand-600">Agentix</span>
          </div>
          <h1 className="text-heading-lg font-semibold text-foreground">Choose your plan</h1>
          <p className="mt-1.5 mb-6 text-body-md text-muted-foreground">
            One last step — activate your workspace to start messaging on WhatsApp.
          </p>
          {children}
        </div>
        <p className="mt-6 text-center text-caption text-muted-foreground">
          © {new Date().getFullYear()} Agentix — Enterprise WhatsApp CRM
        </p>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera, CheckCircle2, MessageSquare } from 'lucide-react';
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
type TermPrice = { total_paise: number; original_total_paise: number | null };
interface ModularPricing {
  core: Record<string, TermPrice>;
  all_in_one: Record<string, TermPrice>;
  instagram_addon: Record<string, TermPrice>;
  google_growth_addon: Record<string, TermPrice>;
}
interface StatusResponse {
  plans: StatusPlan[];
  price_matrix: PriceMatrixRow[];
  modular?: ModularPricing;
  payments_enabled: boolean;
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
  const [hasGoogle, setHasGoogle] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<Term>('monthly');
  const [activating, setActivating] = useState(false);
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

  async function handleFreeActivate() {
    setActivating(true);
    try {
      const res = await fetch('/api/onboarding/activate-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !result.ok) {
        toast.error(result.error ?? 'Could not activate your workspace — please try again');
        setActivating(false);
        return;
      }
      router.push('/conversations');
    } catch {
      toast.error('Network error — please try again');
      setActivating(false);
    }
  }

  // Start the 3-day free trial (no payment) — the default entry into the product.
  async function handleStartTrial() {
    setActivating(true);
    try {
      const res = await fetch('/api/onboarding/start-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !result.ok) {
        toast.error(result.error ?? 'Could not start your trial — please try again');
        setActivating(false);
        return;
      }
      router.push('/conversations');
    } catch {
      toast.error('Network error — please try again');
      setActivating(false);
    }
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

  // Payments are switched off globally (e.g. the payment gateway isn't live yet):
  // activate the workspace for free instead of asking for money. No plan/term/
  // checkout — one button that provisions the workspace and heads to the inbox.
  if (data.payments_enabled === false) {
    return (
      <Shell>
        <div className="space-y-5">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 mt-0.5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">No payment needed right now</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Your workspace is ready to activate — get started free and explore everything. We'll let
                you know when it's time to choose a plan.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4 flex items-start gap-3">
            <MessageSquare className="h-4 w-4 mt-0.5 text-brand-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">WhatsApp CRM</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI-powered inbox, campaigns, chatbot flows, and analytics on your own WhatsApp number.
              </p>
            </div>
          </div>

          <Button
            className="w-full bg-brand-500 hover:bg-brand-600"
            onClick={() => void handleFreeActivate()}
            disabled={activating}
          >
            {activating ? 'Activating…' : 'Activate & Get Started'}
          </Button>
        </div>
      </Shell>
    );
  }

  const modular = data.modular;
  const ALL_TERMS: Term[] = ['monthly', 'quarterly', 'half_yearly', 'yearly'];
  const igAddOnPaise = modular?.instagram_addon?.monthly?.total_paise ?? null;
  const googleAddOnPaise = modular?.google_growth_addon?.monthly?.total_paise ?? null;

  // Build per-term price rows for the chosen combination (Core + add-ons, or the
  // All-in-One bundle when both are selected). Falls back to the legacy matrix if
  // modular pricing isn't available.
  const channelRows: PriceMatrixRow[] = modular
    ? ALL_TERMS.map((t) => {
        const both = hasInstagram && hasGoogle;
        const src = both ? modular.all_in_one[t] : modular.core[t];
        const ig = hasInstagram && !both ? modular.instagram_addon[t] : undefined;
        const gg = hasGoogle && !both ? modular.google_growth_addon[t] : undefined;
        const total = (src?.total_paise ?? 0) + (ig?.total_paise ?? 0) + (gg?.total_paise ?? 0);
        const hasOffer = (src?.original_total_paise ?? null) != null || (ig?.original_total_paise ?? null) != null || (gg?.original_total_paise ?? null) != null;
        const original = hasOffer
          ? (src?.original_total_paise ?? src?.total_paise ?? 0) + (ig?.original_total_paise ?? ig?.total_paise ?? 0) + (gg?.original_total_paise ?? gg?.total_paise ?? 0)
          : null;
        return { key: 'modular', term: t, months: TERMS[t].months, total_paise: total, original_total_paise: original, label: TERMS[t].label };
      })
    : data.price_matrix.filter((r) => r.key === (hasInstagram ? 'whatsapp_instagram' : 'whatsapp'));

  const selectedRow = channelRows.find((r) => r.term === selectedTerm) ?? channelRows[0] ?? null;
  const offerSavings =
    selectedRow?.original_total_paise != null && selectedRow.original_total_paise > selectedRow.total_paise
      ? selectedRow.original_total_paise - selectedRow.total_paise
      : null;

  return (
    <Shell>
      <div className="space-y-5">
        {/* Primary path: start a 3-day free trial, no card required. */}
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 mt-0.5 text-brand-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-brand-900">Start with a 3-day free trial</p>
              <p className="text-xs text-brand-800 mt-0.5">
                Explore the WhatsApp AI chatbot, campaigns and CRM free for 3 days — no card required.
                Add Instagram &amp; Google automation any time by subscribing.
              </p>
            </div>
          </div>
          <Button
            className="w-full bg-brand-500 hover:bg-brand-600"
            onClick={() => void handleStartTrial()}
            disabled={activating}
          >
            {activating ? 'Setting up…' : 'Start 3-day free trial'}
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center"><span className="bg-background px-3 text-xs text-muted-foreground">or subscribe now</span></div>
        </div>

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
                  ? `+₹${rupees(igAddOnPaise)}/month — DM auto-reply, comments, follow-first`
                  : 'Add Instagram automation to your plan'}
              </p>
            </div>
          </div>
          <Switch
            checked={hasInstagram}
            onCheckedChange={(v) => { setHasInstagram(v); clearPending(); }}
          />
        </div>

        <div className="rounded-xl border border-border p-4 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Google Growth add-on</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {googleAddOnPaise != null
                  ? `+₹${rupees(googleAddOnPaise)}/month — Business Profile, Ads, Local Rank, reviews`
                  : 'Add Google automation to your plan'}
              </p>
            </div>
          </div>
          <Switch
            checked={hasGoogle}
            onCheckedChange={(v) => { setHasGoogle(v); clearPending(); }}
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
          hasGoogleGrowth={hasGoogle}
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

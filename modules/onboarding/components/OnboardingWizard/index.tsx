'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
  workspaceName: string;
}

type Step = 1 | 2 | 3 | 4;

interface FormData {
  // Step 1
  businessName: string;
  industry: string;
  businessPhone: string;
  // Step 2
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
  testPhone: string;
  connectionTested: boolean;
  // Step 3
  selectedPlan: string;
}

const INDUSTRIES = [
  'E-commerce',
  'Healthcare',
  'Education',
  'Real Estate',
  'Retail',
  'Restaurant',
  'Other',
] as const;

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    price: '₹1,499',
    period: '/month',
    description: 'Perfect for small businesses getting started.',
    features: ['3 AI Agents', '1,000 messages/month', '5 campaigns/month', '50 KB entries'],
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '₹2,999',
    period: '/month',
    description: 'For growing teams that need more power.',
    features: ['10 AI Agents', '25,000 messages/month', '50 campaigns/month', '500 KB entries'],
    highlight: true,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: '₹9,999',
    period: '/month',
    description: 'Unlimited scale for large operations.',
    features: ['Unlimited Agents', 'Unlimited messages', 'Unlimited campaigns', 'Unlimited KB'],
    highlight: false,
  },
] as const;

const TOTAL_STEPS = 4;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepHeader({ step, title, subtitle }: { step: Step; title: string; subtitle: string }) {
  const pct = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  return (
    <div className="mb-8">
      {/* Brand bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white shadow-sm shadow-brand-500/25">
            A
          </div>
          <span className="text-label font-semibold uppercase tracking-widest text-brand-600">
            Agentix
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          Step {step} of {TOTAL_STEPS}
        </span>
      </div>

      {/* Progress */}
      <Progress value={pct} className="mb-6 h-1.5" />

      {/* Step dots */}
      <div className="mb-6 flex items-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div
            key={s}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all',
              s < step
                ? 'bg-brand-500 text-white'
                : s === step
                  ? 'border-2 border-brand-500 bg-brand-50 text-brand-600'
                  : 'border border-border bg-muted text-muted-foreground',
            )}
          >
            {s < step ? '✓' : s}
          </div>
        ))}
      </div>

      <h1 className="text-heading-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-1.5 text-body-md text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ workspaceId, workspaceName }: Props) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  const [form, setForm] = useState<FormData>({
    businessName: workspaceName,
    industry: '',
    businessPhone: '',
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    testPhone: '',
    connectionTested: false,
    selectedPlan: '',
  });

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Step 1 ─────────────────────────────────────────────────────────────────

  function handleStep1Continue() {
    if (!form.businessName.trim()) {
      toast.error('Please enter your business name.');
      return;
    }
    if (!form.industry) {
      toast.error('Please select your industry.');
      return;
    }
    setStep(2);
  }

  // ── Step 2 ─────────────────────────────────────────────────────────────────

  async function handleTestConnection() {
    if (!form.phoneNumberId.trim() || !form.accessToken.trim() || !form.testPhone.trim()) {
      toast.error('Please fill in Phone Number ID, Access Token, and a test number.');
      return;
    }

    setTestingConnection(true);
    setConnectionStatus('idle');

    try {
      const res = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          phone_number_id: form.phoneNumberId,
          access_token: form.accessToken,
          test_phone: form.testPhone,
        }),
      });

      const data = await res.json() as { success: boolean; error?: string };

      if (data.success) {
        setConnectionStatus('ok');
        set('connectionTested', true);
        toast.success('WhatsApp connection verified! Check your phone for the test message.');
      } else {
        setConnectionStatus('fail');
        toast.error(data.error ?? 'Connection test failed. Check your credentials.');
      }
    } catch {
      setConnectionStatus('fail');
      toast.error('Network error — please try again.');
    } finally {
      setTestingConnection(false);
    }
  }

  function handleStep2Continue() {
    if (!form.connectionTested) {
      toast.error('Please test your connection before continuing.');
      return;
    }
    setStep(3);
  }

  // ── Step 3 ─────────────────────────────────────────────────────────────────

  async function handleSelectPlan(planKey: string) {
    set('selectedPlan', planKey);

    if (planKey === 'starter') {
      // Starter plan handled on step 4 via complete API
      setStep(4);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/billing/razorpay-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, plan: planKey }),
      });

      const data = await res.json() as { checkoutUrl?: string; error?: string };

      if (data.checkoutUrl) {
        // Open Razorpay in new tab, then advance to completion step
        window.open(data.checkoutUrl, '_blank');
        setStep(4);
      } else {
        toast.error(data.error ?? 'Failed to open checkout. Please try again.');
      }
    } catch {
      toast.error('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handlePayLater() {
    set('selectedPlan', 'starter');
    setStep(4);
  }

  // ── Step 4 ─────────────────────────────────────────────────────────────────

  async function handleComplete() {
    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          phone_number_id: form.phoneNumberId,
          access_token: form.accessToken,
          waba_id: form.wabaId || undefined,
          industry: form.industry || undefined,
        }),
      });

      const data = await res.json() as { success?: boolean; error?: string };

      if (data.success) {
        toast.success('Setup complete! Welcome to Agentix.');
        router.push('/conversations');
      } else {
        toast.error(data.error ?? 'Failed to complete setup. Please try again.');
      }
    } catch {
      toast.error('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4 py-12">
      <div className="w-full max-w-2xl animate-fade-in">

        {/* ── Step 1: Business Info ── */}
        {step === 1 && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <StepHeader
              step={1}
              title="Tell us about your business"
              subtitle="This helps us personalise your workspace."
            />

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) => set('businessName', e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="industry">Industry</Label>
                <Select value={form.industry} onValueChange={(v) => set('industry', v)}>
                  <SelectTrigger id="industry">
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="businessPhone">
                  Business Phone <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="businessPhone"
                  value={form.businessPhone}
                  onChange={(e) => set('businessPhone', e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <Button onClick={handleStep1Continue} className="gap-2">
                Continue <span aria-hidden>→</span>
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: WhatsApp Setup ── */}
        {step === 2 && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <StepHeader
              step={2}
              title="Connect WhatsApp"
              subtitle="Enter your WhatsApp Business API credentials from Meta."
            />

            {/* Help callout */}
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
              <p className="font-medium">Where to find these credentials</p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
                <li>
                  <strong>Phone Number ID</strong> — Meta Business Suite → WhatsApp → Phone Numbers
                </li>
                <li>
                  <strong>Access Token</strong> — Meta Business Suite → System Users → Generate Token
                </li>
                <li>
                  <strong>WABA ID</strong> — Meta Business Suite → WhatsApp → Accounts (optional)
                </li>
              </ul>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="phoneNumberId">WhatsApp Phone Number ID</Label>
                <Input
                  id="phoneNumberId"
                  value={form.phoneNumberId}
                  onChange={(e) => {
                    set('phoneNumberId', e.target.value);
                    setConnectionStatus('idle');
                    set('connectionTested', false);
                  }}
                  placeholder="1234567890"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accessToken">WhatsApp Access Token</Label>
                <Input
                  id="accessToken"
                  type="password"
                  value={form.accessToken}
                  onChange={(e) => {
                    set('accessToken', e.target.value);
                    setConnectionStatus('idle');
                    set('connectionTested', false);
                  }}
                  placeholder="EAAxxxxx..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wabaId">
                  WABA ID <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="wabaId"
                  value={form.wabaId}
                  onChange={(e) => set('wabaId', e.target.value)}
                  placeholder="9876543210"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="testPhone">Your WhatsApp Number (to receive test message)</Label>
                <Input
                  id="testPhone"
                  value={form.testPhone}
                  onChange={(e) => {
                    set('testPhone', e.target.value);
                    setConnectionStatus('idle');
                    set('connectionTested', false);
                  }}
                  placeholder="+91 98765 43210"
                />
              </div>

              {/* Test connection row */}
              <div className="flex items-center gap-4 pt-1">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="gap-2"
                >
                  {testingConnection ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Testing…
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>

                {connectionStatus === 'ok' && (
                  <Badge variant="outline" className="gap-1.5 border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300">
                    <span>✅</span> Connection Successful
                  </Badge>
                )}
                {connectionStatus === 'fail' && (
                  <Badge variant="outline" className="gap-1.5 border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
                    <span>❌</span> Connection Failed
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-1">
                <span aria-hidden>←</span> Back
              </Button>
              <Button
                onClick={handleStep2Continue}
                disabled={!form.connectionTested}
                className="gap-2"
              >
                Continue <span aria-hidden>→</span>
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Choose Plan ── */}
        {step === 3 && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <StepHeader
              step={3}
              title="Choose your plan"
              subtitle="Start automating your WhatsApp business today."
            />

            <div className="grid gap-4 sm:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.key}
                  className={cn(
                    'relative flex flex-col rounded-xl border p-5 transition-all',
                    plan.highlight
                      ? 'border-brand-500 bg-brand-50 shadow-md shadow-brand-500/10 dark:bg-brand-950'
                      : 'border-border bg-card',
                  )}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-brand-500 text-white shadow-sm">Most Popular</Badge>
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="font-semibold text-foreground">{plan.name}</h3>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{plan.description}</p>
                  </div>

                  <ul className="mb-5 flex-1 space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="mt-0.5 shrink-0 text-green-500">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="sm"
                    variant={plan.highlight ? 'default' : 'outline'}
                    className={cn('w-full', plan.highlight && 'bg-brand-500 hover:bg-brand-600')}
                    onClick={() => handleSelectPlan(plan.key)}
                    disabled={loading}
                  >
                    {loading && form.selectedPlan === plan.key ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      `Choose ${plan.name}`
                    )}
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(2)} className="gap-1">
                <span aria-hidden>←</span> Back
              </Button>
              <button
                type="button"
                onClick={handlePayLater}
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                I'll pay later — skip for now
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Complete ── */}
        {step === 4 && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <StepHeader
              step={4}
              title="Almost there!"
              subtitle="Let's finalise your workspace setup."
            />

            <div className="mb-8 rounded-xl border border-green-200 bg-green-50 px-6 py-5 dark:border-green-800 dark:bg-green-950">
              <div className="mb-3 text-3xl">🎉</div>
              <h2 className="text-lg font-semibold text-green-900 dark:text-green-100">
                You're all set! Your WhatsApp CRM is ready.
              </h2>
              <p className="mt-1.5 text-sm text-green-700 dark:text-green-300">
                Your workspace <strong>{workspaceName}</strong> is configured and ready to start
                conversations.
              </p>

              {/* Summary */}
              <dl className="mt-4 space-y-1.5 text-sm">
                {form.industry && (
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 font-medium text-green-800 dark:text-green-200">Industry</dt>
                    <dd className="text-green-700 dark:text-green-300">{form.industry}</dd>
                  </div>
                )}
                {form.phoneNumberId && (
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 font-medium text-green-800 dark:text-green-200">Phone ID</dt>
                    <dd className="truncate text-green-700 dark:text-green-300">{form.phoneNumberId}</dd>
                  </div>
                )}
                {form.selectedPlan && (
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 font-medium text-green-800 dark:text-green-200">Plan</dt>
                    <dd className="capitalize text-green-700 dark:text-green-300">{form.selectedPlan}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(3)} className="gap-1">
                <span aria-hidden>←</span> Back
              </Button>
              <Button onClick={handleComplete} disabled={loading} className="gap-2">
                {loading ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Saving…
                  </>
                ) : (
                  <>
                    Go to Dashboard <span aria-hidden>→</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="mt-6 text-center text-caption text-muted-foreground">
          © {new Date().getFullYear()} Agentix. Enterprise WhatsApp CRM.
        </p>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  CreditCard, Save, Lock, Settings2, Package, Zap,
  CheckCircle2, Info,
} from 'lucide-react';
import { ChangePassword } from '@/modules/settings/components/ChangePassword';
import { rupees } from '@/lib/billing';
import { DEFAULT_META_RATES, type MetaRates } from '@/lib/meta-rates';

// ── Billing Configuration types (mirrors modules/admin/components/BillingOverview) ──
interface AdminBillingResponse {
  config: { grace_days: number; reminder_days_before: number; payments_enabled: boolean };
}

// ── Plans & Pricing types ──
interface PlanRow {
  key: string;
  term: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  name: string;
  months: number;
  base_paise: number;
  total_paise: number;
  original_total_paise: number | null;
  includes_instagram: boolean;
}
interface PlansResponse {
  plans: PlanRow[];
}

const TERM_ORDER = ['monthly', 'quarterly', 'half_yearly', 'yearly'] as const;
const TERM_LABEL: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: '6 Months',
  yearly: 'Yearly',
};
const PLAN_KEY_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  whatsapp_instagram: 'WhatsApp + Instagram',
};

// ── Automation & System: what runs on its own, no action needed ──
interface AutomationJob {
  name: string;
  cadence: string;
  description: string;
}
const AUTOMATION_JOBS: AutomationJob[] = [
  {
    name: 'Billing sweep',
    cadence: 'Daily, 4:30 AM',
    description: 'Sends renewal reminders, counts down the grace period, and auto-suspends subscriptions that exceed it.',
  },
  {
    name: 'Auto-resolve',
    cadence: 'Every 2 hours',
    description: 'Marks conversations with 3+ days of no activity as resolved (spam is skipped).',
  },
  {
    name: 'Auto-tagging',
    cadence: 'Every 3 hours',
    description: 'Re-derives contact tags from lead temperature, source, VIP flag, and lifecycle stage.',
  },
  {
    name: 'Lead AI classification',
    cadence: 'Real-time + 15-min backstop',
    description: 'Classifies leads as messages arrive; a resweep catches any missing or stale classification.',
  },
  {
    name: 'Auto-CSAT',
    cadence: 'Every 30 minutes',
    description: 'Asks customers to rate a conversation once it has naturally wound down (capped at 30 sends/run).',
  },
  {
    name: 'Auto-assign',
    cadence: 'Every 10 minutes (opt-in)',
    description: 'Distributes unassigned open conversations, and their linked lead, to the least-busy team member. Off by default per workspace.',
  },
  {
    name: 'Temperature cooldown',
    cadence: 'Every 6 hours',
    description: 'Downgrades lead temperature (hot -> warm -> cold) based on how long since the customer last wrote in.',
  },
  {
    name: 'Sentiment backfill',
    cadence: 'Every 20 minutes',
    description: 'Fills in missing sentiment on older conversations that predate live scoring; idles once caught up.',
  },
  {
    name: 'Reply sweep',
    cadence: 'Every 3 minutes',
    description: 'Answers any customer whose latest message went unanswered (missed-reply watchdog).',
  },
];

export default function SettingsPage() {
  const [rates, setRates] = useState<MetaRates>(DEFAULT_META_RATES);
  const [ratesSeeded, setRatesSeeded] = useState(false);
  const qc = useQueryClient();

  // ── Meta Payment Setup rates — REAL, wired to /api/admin/meta-rates ──
  const { data: metaRatesData } = useQuery<{ rates: MetaRates }>({
    queryKey: ['admin', 'meta-rates'],
    queryFn: () => fetch('/api/admin/meta-rates').then((r) => {
      if (!r.ok) throw new Error('Failed to load Meta rates');
      return r.json();
    }),
  });

  useEffect(() => {
    if (metaRatesData && !ratesSeeded) {
      setRates(metaRatesData.rates);
      setRatesSeeded(true);
    }
  }, [metaRatesData, ratesSeeded]);

  const ratesMut = useMutation({
    mutationFn: (body: MetaRates) =>
      fetch('/api/admin/meta-rates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error ?? 'Failed to save');
        return d;
      }),
    onSuccess: (d: { rates: MetaRates }) => {
      toast.success('Meta rates saved');
      setRates(d.rates);
      qc.invalidateQueries({ queryKey: ['admin', 'meta-rates'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Billing Configuration ──
  const [graceDays, setGraceDays] = useState('');
  const [reminderDays, setReminderDays] = useState('');
  const [seeded, setSeeded] = useState(false);

  const { data: billingData, isLoading: billingLoading, isError: billingError, refetch: refetchBilling } =
    useQuery<AdminBillingResponse>({
      queryKey: ['admin', 'billing'],
      queryFn: () => fetch('/api/admin/billing').then((r) => {
        if (!r.ok) throw new Error('Failed to load billing configuration');
        return r.json();
      }),
    });

  useEffect(() => {
    if (billingData && !seeded) {
      setGraceDays(String(billingData.config.grace_days));
      setReminderDays(String(billingData.config.reminder_days_before));
      setSeeded(true);
    }
  }, [billingData, seeded]);

  const configMut = useMutation({
    mutationFn: (body: { grace_days?: number; reminder_days_before?: number; payments_enabled?: boolean }) =>
      fetch('/api/admin/billing/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error ?? 'Failed to save');
        return d;
      }),
    onSuccess: () => {
      toast.success('Billing configuration saved');
      qc.invalidateQueries({ queryKey: ['admin', 'billing'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paymentsEnabled = billingData?.config.payments_enabled ?? true;

  // ── Plans & Pricing ──
  const { data: plansData, isLoading: plansLoading, isError: plansError } = useQuery<PlansResponse>({
    queryKey: ['admin', 'billing', 'plans'],
    queryFn: () => fetch('/api/admin/billing/plans').then((r) => {
      if (!r.ok) throw new Error('Failed to load plans');
      return r.json();
    }),
  });

  const plansByKey = new Map<string, PlanRow[]>();
  for (const p of plansData?.plans ?? []) {
    const arr = plansByKey.get(p.key) ?? [];
    arr.push(p);
    plansByKey.set(p.key, arr);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Platform configuration</p>
      </div>

      {/* 1. Account Security — change super-admin password */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <Lock className="h-5 w-5" style={{ color: '#F97316' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Account Security</h2>
            <p className="text-xs text-gray-400">Change your super-admin sign-in password</p>
          </div>
        </div>
        <ChangePassword />
      </div>

      {/* 2. Billing Configuration — REAL, wired to /api/admin/billing/config */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <Settings2 className="h-5 w-5" style={{ color: '#F97316' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Billing Configuration</h2>
            <p className="text-xs text-gray-400">Grace period and renewal reminder timing used by the daily billing sweep</p>
          </div>
        </div>

        {/* Global payments switch — when OFF, new self-serve signups activate free
            (no checkout) and no one is asked to pay. Turn ON once the payment
            gateway / website is verified. */}
        <div className="mb-5 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="pr-4">
            <p className="text-sm font-semibold text-gray-900">Accept payments</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {paymentsEnabled
                ? 'New clients are asked to pay to activate their workspace.'
                : 'Payments are OFF — new signups activate for free, and no client is asked to pay.'}
            </p>
          </div>
          <Switch
            checked={paymentsEnabled}
            disabled={billingLoading || configMut.isPending}
            onCheckedChange={(v) => configMut.mutate({ payments_enabled: v })}
          />
        </div>

        {billingError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
            <span>Could not load billing configuration.</span>
            <button type="button" onClick={() => void refetchBilling()} className="underline font-medium">Retry</button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-500">Grace period (days)</Label>
              {billingLoading && !seeded ? (
                <Skeleton className="h-10 w-full mt-1" />
              ) : (
                <Input
                  type="number" min={1}
                  value={graceDays}
                  onChange={(e) => setGraceDays(e.target.value)}
                  className="mt-1"
                />
              )}
              <p className="text-xs text-gray-400 mt-1.5">
                How many days after a subscription expires before it&apos;s automatically suspended. Clients get daily reminders during this window.
              </p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Renewal reminder (days before)</Label>
              {billingLoading && !seeded ? (
                <Skeleton className="h-10 w-full mt-1" />
              ) : (
                <Input
                  type="number" min={1}
                  value={reminderDays}
                  onChange={(e) => setReminderDays(e.target.value)}
                  className="mt-1"
                />
              )}
              <p className="text-xs text-gray-400 mt-1.5">
                How many days before renewal the first reminder email + notification is sent.
              </p>
            </div>
          </div>
        )}

        <Button
          className="mt-4 gap-2 text-white"
          style={{ backgroundColor: '#F97316' }}
          disabled={configMut.isPending || billingLoading || !graceDays || !reminderDays}
          onClick={() => configMut.mutate({ grace_days: Number(graceDays), reminder_days_before: Number(reminderDays) })}
        >
          <Save className="h-4 w-4" /> {configMut.isPending ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {/* 3. Plans & Pricing — read-only, real billing_plans rows */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <Package className="h-5 w-5" style={{ color: '#F97316' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Plans &amp; Pricing</h2>
            <p className="text-xs text-gray-400">Platform subscription pricing. These are the plans clients are billed on.</p>
          </div>
        </div>

        {plansError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Could not load plans.
          </div>
        ) : plansLoading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {['whatsapp', 'whatsapp_instagram'].map((key) => {
              const rows = (plansByKey.get(key) ?? []).slice().sort(
                (a, b) => TERM_ORDER.indexOf(a.term) - TERM_ORDER.indexOf(b.term),
              );
              return (
                <div key={key} className="rounded-xl border border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-800 mb-3">{PLAN_KEY_LABEL[key] ?? key}</p>
                  <div className="space-y-2">
                    {rows.map((p) => (
                      <div key={`${p.key}-${p.term}`} className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">{TERM_LABEL[p.term] ?? p.term}</span>
                        <span className="flex items-baseline gap-2">
                          {p.original_total_paise != null && p.original_total_paise > p.total_paise && (
                            <span className="text-xs text-gray-400 line-through">₹{rupees(p.original_total_paise)}</span>
                          )}
                          <span className="font-semibold text-gray-900 tabular-nums">₹{rupees(p.total_paise)}</span>
                        </span>
                      </div>
                    ))}
                    {rows.length === 0 && <p className="text-xs text-gray-400">No pricing rows found.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4">All amounts are incl. GST. Prices are managed directly in the database (billing_plans table).</p>
      </div>

      {/* 4. Automation & System — informational, no controls */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <Zap className="h-5 w-5" style={{ color: '#F97316' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Automation &amp; System</h2>
            <p className="text-xs text-gray-400">Background jobs that keep the platform running</p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-gray-50 border border-gray-100 p-3 mb-4">
          <Info className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-500">These run automatically — no action needed. Listed here so you know what happens behind the scenes across every workspace.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {AUTOMATION_JOBS.map((job) => (
            <div key={job.name} className="flex items-start gap-2.5 rounded-xl border border-gray-100 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-800">{job.name}</p>
                  <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{job.cadence}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{job.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Meta Payment Setup */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <CreditCard className="h-5 w-5" style={{ color: '#F97316' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Meta Payment Setup</h2>
            <p className="text-xs text-gray-400">Primary card & per-conversation rates (INR)</p>
          </div>
        </div>

        {/* Primary card info */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Primary Payment Card</p>
          <p className="text-sm text-gray-700">Add Agentix&apos;s payment card to each client&apos;s WABA via Meta Business Manager.</p>
          <p className="text-xs text-gray-400 mt-1">Meta → Business Settings → WhatsApp Accounts → [Client] → Payment Settings</p>
        </div>

        {/* Rates */}
        <div className="grid grid-cols-2 gap-4">
          {(Object.keys(rates) as Array<keyof typeof rates>).map(key => (
            <div key={key}>
              <Label className="text-xs text-gray-500 capitalize">{key} (₹ per conversation)</Label>
              <Input
                type="number" step="0.01"
                value={rates[key]}
                onChange={e => setRates(r => ({ ...r, [key]: Number(e.target.value) }))}
                className="mt-1"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Button className="gap-2 text-white" style={{ backgroundColor: '#F97316' }}
            disabled={ratesMut.isPending}
            onClick={() => ratesMut.mutate(rates)}>
            <Save className="h-4 w-4" /> {ratesMut.isPending ? 'Saving...' : 'Save Rates'}
          </Button>
        </div>
      </div>
    </div>
  );
}

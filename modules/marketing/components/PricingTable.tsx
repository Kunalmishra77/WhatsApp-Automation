'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TermId = 'monthly' | 'quarterly' | 'sixmonth' | 'yearly';

interface TermOption { id: TermId; label: string; months: number; cadence: string; }

const TERMS: TermOption[] = [
  { id: 'monthly', label: 'Monthly', months: 1, cadence: 'billed monthly' },
  { id: 'quarterly', label: 'Quarterly', months: 3, cadence: 'billed every 3 months' },
  { id: 'sixmonth', label: '6-Month', months: 6, cadence: 'billed every 6 months' },
  { id: 'yearly', label: 'Yearly', months: 12, cadence: 'billed annually' },
];

type Amount = { price: number; original?: number };

// Published display amounts (excl. GST) — kept in sync with billing_plans (migrations 101/102).
const CORE: Record<TermId, Amount> = {
  monthly: { price: 2999 },
  quarterly: { price: 8997 },
  sixmonth: { price: 15000, original: 17994 },
  yearly: { price: 30000, original: 35988 },
};
// Per-add-on delta (Instagram, Google Growth are the same price).
const ADDON: Record<TermId, Amount> = {
  monthly: { price: 999 },
  quarterly: { price: 2997 },
  sixmonth: { price: 5000, original: 5994 },
  yearly: { price: 9990, original: 11988 },
};
// All-in-One bundle (Core + both add-ons) — the headline ₹4,999/mo.
const ALL_IN_ONE: Record<TermId, Amount> = {
  monthly: { price: 4999 },
  quarterly: { price: 14997 },
  sixmonth: { price: 25000, original: 29994 },
  yearly: { price: 49990, original: 59988 },
};

const GST_RATE = 0.18;

const BASE_FEATURES = [
  'Live AI agent on WhatsApp, bundled — not an add-on',
  'Shared WhatsApp inbox for your whole team',
  'Kanban CRM with automatic hot / warm / cold scoring',
  'Campaigns, broadcasts & message templates',
  'Razorpay payment links, in-chat',
];
const INSTAGRAM_FEATURES = ['Instagram DM auto-reply, comment-reply & follow-first'];
const GOOGLE_FEATURES = ['Google Business Profile, Google Ads, Local Rank & review automation'];

function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}
function savePercent(price: number, original: number): number {
  return Math.round(((original - price) / original) * 100);
}

/**
 * Modular pricing card — Core (WhatsApp) with optional Instagram and Google Growth
 * add-ons. Both add-ons together = the All-in-One bundle (₹4,999/mo). Amounts are
 * hardcoded display values kept in sync with billing_plans manually.
 */
export function PricingTable() {
  const [term, setTerm] = useState<TermId>('monthly');
  const [instagram, setInstagram] = useState(false);
  const [google, setGoogle] = useState(false);

  const { plan, label } = useMemo(() => {
    if (instagram && google) return { plan: ALL_IN_ONE[term], label: 'All-in-One' };
    const core = CORE[term];
    const addon = ADDON[term];
    const addonCount = (instagram ? 1 : 0) + (google ? 1 : 0);
    if (addonCount === 0) return { plan: core, label: 'Core (WhatsApp)' };
    const price = core.price + addon.price * addonCount;
    const original = (core.original ?? core.price) + (addon.original ?? addon.price) * addonCount;
    const hasOffer = core.original != null || addon.original != null;
    return {
      plan: { price, ...(hasOffer ? { original } : {}) } as Amount,
      label: instagram ? 'Core + Instagram' : 'Core + Google Growth',
    };
  }, [term, instagram, google]);

  const activeTerm = TERMS.find((t) => t.id === term)!;
  const gstPrice = plan.price * (1 + GST_RATE);
  const savings = plan.original ? savePercent(plan.price, plan.original) : null;

  const features = [
    ...BASE_FEATURES,
    ...(instagram ? INSTAGRAM_FEATURES : []),
    ...(google ? GOOGLE_FEATURES : []),
  ];

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-navy-900/10 bg-white p-8 shadow-lg shadow-navy-900/5 sm:p-10">
      {/* Term toggle */}
      <div role="tablist" aria-label="Billing term" className="grid grid-cols-2 gap-2 rounded-2xl bg-navy-50 p-1.5 sm:grid-cols-4">
        {TERMS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={term === t.id}
            onClick={() => setTerm(t.id)}
            className={cn(
              'rounded-xl px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:text-sm',
              term === t.id ? 'bg-navy-900 text-white shadow-sm' : 'text-navy-900/60 hover:text-navy-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Add-on toggles */}
      <div className="mt-6 space-y-2">
        <AddonToggle
          title="Add Instagram automation"
          subtitle="Auto-reply to DMs, comments & follow-first · +₹999/mo"
          checked={instagram}
          onChange={setInstagram}
        />
        <AddonToggle
          title="Add Google Growth"
          subtitle="Business Profile, Ads, Local Rank & reviews · +₹999/mo"
          checked={google}
          onChange={setGoogle}
        />
      </div>

      {/* Price */}
      <div className="mt-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">{label}</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          {plan.original && <span className="text-lg font-medium text-navy-900/35 line-through">{formatINR(plan.original)}</span>}
          <span className="font-display text-5xl font-bold text-navy-900">{formatINR(plan.price)}</span>
          <span className="text-sm font-medium text-navy-900/50">/ {activeTerm.label.toLowerCase()}</span>
          {savings !== null && (
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">Save {savings}%</span>
          )}
        </div>
        <p className="mt-2 text-sm text-navy-900/50">
          Prices exclude 18% GST · {formatINR(gstPrice)} incl. GST · {activeTerm.cadence}
        </p>
      </div>

      {/* Features */}
      <ul className="mt-7 space-y-3 text-sm text-navy-900/70">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>

      <Button asChild size="lg" className="mt-8 w-full bg-brand-500 text-white hover:bg-brand-600">
        <Link href="/signup">Start 3-day free trial</Link>
      </Button>
      <p className="mt-3 text-center text-xs text-navy-900/45">No card required · Core features free for 3 days</p>
    </div>
  );
}

function AddonToggle({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-navy-900/10 bg-navy-50/60 px-4 py-3">
      <span>
        <span className="block text-sm font-semibold text-navy-900">{title}</span>
        <span className="block text-xs text-navy-900/50">{subtitle}</span>
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" aria-label={title} />
        <span className={cn('h-6 w-11 rounded-full transition-colors', checked ? 'bg-brand-500' : 'bg-navy-900/15')} />
        <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </span>
    </label>
  );
}

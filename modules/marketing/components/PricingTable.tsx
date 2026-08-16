'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TermId = 'monthly' | 'quarterly' | 'sixmonth' | 'yearly';

interface TermOption {
  id: TermId;
  label: string;
  months: number;
  /** Shown under the term pill in the toggle. */
  cadence: string;
}

const TERMS: TermOption[] = [
  { id: 'monthly', label: 'Monthly', months: 1, cadence: 'billed monthly' },
  { id: 'quarterly', label: 'Quarterly', months: 3, cadence: 'billed every 3 months' },
  { id: 'sixmonth', label: '6-Month', months: 6, cadence: 'billed every 6 months' },
  { id: 'yearly', label: 'Yearly', months: 12, cadence: 'billed annually' },
];

/** Published, hardcoded display amounts — base plan (WhatsApp only) excludes GST. */
const WHATSAPP_PRICING: Record<TermId, { price: number; original?: number }> = {
  monthly: { price: 2999 },
  quarterly: { price: 8997 },
  sixmonth: { price: 15000, original: 17994 }, // 2999 * 6, offer ~17% off
  yearly: { price: 30000, original: 35988 }, // 2999 * 12, offer ~17% off
};

/** WhatsApp + Instagram add-on — bundle total (not a delta on top of the base plan). */
const INSTAGRAM_PRICING: Record<TermId, { price: number; original?: number }> = {
  monthly: { price: 3998 },
  quarterly: { price: 11994 },
  sixmonth: { price: 20000, original: 23988 }, // 3998 * 6, same offer %
  yearly: { price: 40000, original: 47976 }, // 3998 * 12, same offer %
};

const GST_RATE = 0.18;

const BASE_FEATURES = [
  'Live AI agent, bundled — not an add-on',
  'Shared WhatsApp inbox for your whole team',
  'Kanban CRM with automatic hot / warm / cold scoring',
  'Campaigns, broadcasts & message templates',
  'Razorpay payment links, in-chat',
  'Google Sheets lead export',
];

const INSTAGRAM_FEATURES = [
  'Instagram DMs in the same shared inbox',
  'The same AI agent replies across both channels',
];

function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function savePercent(price: number, original: number): number {
  return Math.round(((original - price) / original) * 100);
}

/**
 * Pricing card for the /pricing page — term toggle (Monthly / Quarterly / 6-Month / Yearly),
 * an Instagram add-on switch, the resulting price (excl. GST, with an incl.-GST note), the
 * included feature list, and a Get Started CTA. Amounts are hardcoded display values (see
 * component comments) — not read from billing_plans, so keep them in sync manually if the
 * published prices change.
 */
export function PricingTable() {
  const [term, setTerm] = useState<TermId>('monthly');
  const [instagram, setInstagram] = useState(false);

  const plan = useMemo(() => {
    const table = instagram ? INSTAGRAM_PRICING : WHATSAPP_PRICING;
    return table[term];
  }, [term, instagram]);

  const activeTerm = TERMS.find((t) => t.id === term)!;
  const gstPrice = plan.price * (1 + GST_RATE);
  const savings = plan.original ? savePercent(plan.price, plan.original) : null;

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-navy-900/10 bg-white p-8 shadow-lg shadow-navy-900/5 sm:p-10">
      {/* Term toggle */}
      <div
        role="tablist"
        aria-label="Billing term"
        className="grid grid-cols-2 gap-2 rounded-2xl bg-navy-50 p-1.5 sm:grid-cols-4"
      >
        {TERMS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={term === t.id}
            onClick={() => setTerm(t.id)}
            className={cn(
              'rounded-xl px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:text-sm',
              term === t.id
                ? 'bg-navy-900 text-white shadow-sm'
                : 'text-navy-900/60 hover:text-navy-900'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Instagram add-on toggle */}
      <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-navy-900/10 bg-navy-50/60 px-4 py-3">
        <span>
          <span className="block text-sm font-semibold text-navy-900">Add Instagram DMs</span>
          <span className="block text-xs text-navy-900/50">Same AI agent, same inbox, both channels</span>
        </span>
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
          <input
            type="checkbox"
            checked={instagram}
            onChange={(e) => setInstagram(e.target.checked)}
            className="peer sr-only"
            aria-label="Add Instagram DMs"
          />
          <span
            className={cn(
              'h-6 w-11 rounded-full transition-colors',
              instagram ? 'bg-brand-500' : 'bg-navy-900/15'
            )}
          />
          <span
            className={cn(
              'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
              instagram && 'translate-x-5'
            )}
          />
        </span>
      </label>

      {/* Price */}
      <div className="mt-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">
          {instagram ? 'WhatsApp + Instagram' : 'WhatsApp Growth'}
        </p>
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          {plan.original && (
            <span className="text-lg font-medium text-navy-900/35 line-through">
              {formatINR(plan.original)}
            </span>
          )}
          <span className="font-display text-5xl font-bold text-navy-900">{formatINR(plan.price)}</span>
          <span className="text-sm font-medium text-navy-900/50">/ {activeTerm.label.toLowerCase()}</span>
          {savings !== null && (
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
              Save {savings}%
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-navy-900/50">
          Prices exclude 18% GST · {formatINR(gstPrice)} incl. GST · {activeTerm.cadence}
        </p>
      </div>

      {/* Features */}
      <ul className="mt-7 space-y-3 text-sm text-navy-900/70">
        {[...BASE_FEATURES, ...(instagram ? INSTAGRAM_FEATURES : [])].map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>

      <Button asChild size="lg" className="mt-8 w-full bg-brand-500 text-white hover:bg-brand-600">
        <Link href="/signup">Get Started</Link>
      </Button>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';

// Slim banner shown only while a workspace is on its 3-day trial — surfaces days
// left and a path to subscribe. Comped/paid clients never see it.
export function TrialBanner() {
  const { entitlements } = useEntitlements();
  if (!entitlements.trialing) return null;

  const days = entitlements.trialDaysLeft ?? 0;
  const daysLabel = days <= 0 ? 'Trial ends today' : `${days} day${days === 1 ? '' : 's'} left in your free trial`;

  return (
    <div className="flex items-center gap-2 border-b border-brand-200 bg-brand-50 px-4 py-2 text-sm">
      <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
      <span className="font-medium text-brand-900">{daysLabel}</span>
      <span className="hidden text-brand-700 sm:inline">— unlock Instagram &amp; Google automation and remove limits.</span>
      <Link
        href="/billing"
        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-600"
      >
        Upgrade <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

'use client';

import { CalendarClock, AlertTriangle } from 'lucide-react';
import { timeLeft } from '@/lib/billing';
import { cn } from '@/lib/utils';

interface CountdownProps {
  /** Active subscription's current_period_end (YYYY-MM-DD), or null if there's no subscription yet. */
  periodEnd: string | null;
  /** Pre-formatted next-billing date for display, e.g. "13 Sep 2026". */
  nextBillingLabel: string;
}

// Plan countdown card: "X days left" -> "X hours left" -> "Expired", styled
// amber inside the final 3 days and red once the period has actually lapsed.
// Only rendered by the caller when there's an active subscription with a period end.
export function Countdown({ periodEnd, nextBillingLabel }: CountdownProps) {
  if (!periodEnd) return null;

  const t = timeLeft(periodEnd, new Date());
  const urgent = !t.expired && t.days < 3;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
        t.expired
          ? 'border-red-200 bg-red-50 text-red-700'
          : urgent
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-border bg-muted/40 text-muted-foreground'
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        {t.expired || urgent ? <AlertTriangle className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
        {t.label}
      </span>
      <span className="text-xs">
        Next billing: <span className="font-medium">{nextBillingLabel}</span>
      </span>
    </div>
  );
}

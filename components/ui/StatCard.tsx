'use client';

import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Shared stat-card primitive — unifies CommandCenter's KpiCard/StatTile,
// MyWorkDashboard's MetricCard and AdminDashboard's KpiCard into one
// theme-safe (light/dark) building block. `size="md"` reproduces the
// KpiCard look (icon top-right, compact); `size="sm"` reproduces the
// StatTile look (centered, no icon by default). Pass `onClick` to make the
// card a keyboard-accessible button with a hover affordance; omit it for a
// static, non-interactive card.
export interface StatCardProps {
  /** Small label — above the value for size="md", below it for size="sm". */
  label: string;
  /** Already-formatted value — callers format numbers/currency themselves. */
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Tailwind text-color class applied to the icon. Defaults to 'text-white' (for solid iconBg fills). */
  iconColor?: string;
  /** Tailwind bg class for the icon's container, e.g. 'bg-brand-500' or 'bg-green-100'. */
  iconBg?: string;
  /** Small line rendered under the value. */
  sub?: React.ReactNode;
  /**
   * %-change vs prior period. `null` renders a neutral "No prior data" chip,
   * `0` renders a neutral "0% vs prior period" chip, positive renders a
   * green up-arrow chip, negative a red down-arrow chip. Omit entirely (leave
   * `undefined`) to render no chip at all.
   */
  change?: number | null;
  loading?: boolean;
  /** When set, the card becomes a keyboard-accessible button with a hover affordance. */
  onClick?: () => void;
  /** 'md' (default) = KpiCard look. 'sm' = StatTile look. */
  size?: 'sm' | 'md';
  className?: string;
}

// null → grey "no prior data" chip; 0 → grey flat chip; positive → green
// up-arrow; negative → red down-arrow. Mirrors CommandCenter/KpiCard's
// ChangeChip exactly (the 0-vs-null distinction was deliberately fixed there
// — preserve it here).
function ChangeChip({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium mt-1 text-muted-foreground">
        <Minus className="h-2.5 w-2.5" /> No prior data
      </span>
    );
  }
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium mt-1 text-muted-foreground">
        <Minus className="h-2.5 w-2.5" /> 0% vs prior period
      </span>
    );
  }
  const up = value > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium mt-1', up ? 'text-green-600' : 'text-red-500')}>
      {up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {Math.abs(value)}% vs prior period
    </span>
  );
}

const interactiveClasses =
  'cursor-pointer hover:shadow-[0_4px_12px_0_rgb(0_0_0/0.09)] hover:border-brand-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function StatCard({
  label, value, icon: Icon, iconColor = 'text-white', iconBg, sub, change, loading = false, onClick, size = 'md', className,
}: StatCardProps) {
  const interactive = !!onClick;

  const interactiveProps = interactive
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  if (size === 'sm') {
    return (
      <div
        {...interactiveProps}
        className={cn(
          'rounded-xl border border-border bg-card text-foreground p-3 text-center transition-all',
          interactive && interactiveClasses,
          className,
        )}
      >
        {Icon && (
          <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mx-auto mb-1.5', iconBg)}>
            <Icon className={cn('h-4 w-4', iconColor)} />
          </div>
        )}
        {loading ? (
          <Skeleton className="h-7 w-12 mx-auto mb-1" />
        ) : (
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
        {!loading && change !== undefined && <ChangeChip value={change} />}
      </div>
    );
  }

  return (
    <div
      {...interactiveProps}
      className={cn(
        'rounded-lg border border-border bg-card text-foreground shadow-sm pt-4 pb-3 px-4 transition-all',
        interactive && interactiveClasses,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground mb-1 truncate">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-16 mb-1" />
          ) : (
            <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
          )}
          {sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
          {!loading && change !== undefined && <ChangeChip value={change} />}
        </div>
        {Icon && (
          <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5', iconBg)}>
            <Icon className={cn('h-4 w-4', iconColor)} />
          </div>
        )}
      </div>
    </div>
  );
}

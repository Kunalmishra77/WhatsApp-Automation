'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Shared KPI card — unifies the AnalyticsDashboard `KpiCard` and dashboard-page
// `MetricCard` patterns into a single component used by CommandCenter. A
// %-change chip renders green (up) / red (down) / grey (pct_change === null,
// i.e. no previous-period baseline to compare against).
export function KpiCard({
  title, value, sub, icon: Icon, iconBg, loading, pctChange,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  loading: boolean;
  pctChange?: number | null;
}) {
  return (
    <Card className="transition-all">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1 truncate">{title}</p>
            {loading
              ? <Skeleton className="h-7 w-16 mb-1" />
              : <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
            }
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
            {!loading && pctChange !== undefined && (
              <ChangeChip value={pctChange} />
            )}
          </div>
          <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5', iconBg)}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// null → grey "no change data" chip; positive → green up-arrow; negative → red down-arrow.
function ChangeChip({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium mt-1 text-muted-foreground">
        <Minus className="h-2.5 w-2.5" /> No prior data
      </span>
    );
  }
  const up = value >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium mt-1', up ? 'text-green-600' : 'text-red-500')}>
      {up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {Math.abs(value)}% vs prior period
    </span>
  );
}

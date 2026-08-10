'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import type { SpendSeriesPoint } from '../../hooks/useMetaSpend';

const BRAND = '#6366f1';
const TT = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 };

function fmtDay(d: string) {
  const parsed = new Date(d.length === 7 ? `${d}-01` : `${d}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export function SpendChart({
  data, loading, formatCurrency,
}: {
  data: SpendSeriesPoint[];
  loading: boolean;
  formatCurrency: (n: number) => string;
}) {
  if (loading) return <Skeleton className="h-56 w-full rounded-lg" />;
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">No Meta billing data for this period.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={BRAND} stopOpacity={0.25} />
            <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={fmtDay} label={{ value: 'Date', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => formatCurrency(v)} />
        <Tooltip contentStyle={TT} labelFormatter={(l: string) => fmtDay(l)} formatter={(v: number) => [formatCurrency(v), 'Spend']} />
        <Area type="monotone" dataKey="cost" name="Spend" stroke={BRAND} fill="url(#gSpend)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

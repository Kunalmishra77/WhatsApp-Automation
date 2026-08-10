'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, TrendingUp, Wallet, RefreshCw, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveRange } from '@/lib/meta-spend';

interface CurrencyTotal { currency: string; total: number }
interface ClientRow { workspace_id: string; name: string; currency: string; total: number; last_synced_at: string | null }
interface DatePoint { day: string; currency: string; cost: number }
interface FailureRow { workspace_id: string; name: string; error: string; created_at: string }

interface MetaSpendAdmin {
  from: string;
  to: string;
  totals: CurrencyTotal[];
  by_client: ClientRow[];
  by_date: DatePoint[];
  recent_failures: FailureRow[];
}

const QUICK_RANGES: Array<{ key: string; label: string }> = [
  { key: 'today',        label: 'Today' },
  { key: 'last_7_days',  label: 'Last 7 Days' },
  { key: 'this_month',   label: 'This Month' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'last_90_days', label: 'Last 90 Days' },
  { key: 'this_year',    label: 'This Year' },
];

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR' }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency || ''}`.trim();
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDay(d: string) {
  const parsed = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

const CHART_COLOR = '#F97316';

export function MetaSpendOverview() {
  const [quickKey, setQuickKey] = useState('last_30_days');
  const [chartCurrency, setChartCurrency] = useState<string | null>(null);

  const { from, to } = useMemo(() => resolveRange(quickKey, new Date()), [quickKey]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<MetaSpendAdmin>({
    queryKey: ['admin', 'meta-spend', from, to],
    queryFn:  () => fetch(`/api/admin/meta-spend?from=${from}&to=${to}`).then((r) => {
      if (!r.ok) throw new Error('Failed to load');
      return r.json();
    }),
  });

  const totals   = data?.totals ?? [];
  const byClient = data?.by_client ?? [];
  const byDate   = data?.by_date ?? [];
  const failures = data?.recent_failures ?? [];
  const topSpenders = byClient.slice(0, 5);

  // Currencies present in the by-date series — chart shows one at a time.
  const currenciesInSeries = useMemo(() => [...new Set(byDate.map((p) => p.currency))], [byDate]);
  const activeCurrency = chartCurrency && currenciesInSeries.includes(chartCurrency)
    ? chartCurrency
    : (currenciesInSeries[0] ?? null);
  const chartSeries = useMemo(
    () => byDate.filter((p) => p.currency === activeCurrency).map((p) => ({ label: p.day, cost: p.cost })),
    [byDate, activeCurrency],
  );

  return (
    <div className="space-y-4">

      {/* Range picker + refresh */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap rounded-lg border border-gray-200 overflow-hidden bg-white">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setQuickKey(r.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                quickKey === r.key ? 'text-white' : 'bg-white text-gray-500 hover:text-gray-800',
              )}
              style={quickKey === r.key ? { backgroundColor: CHART_COLOR } : {}}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load platform spend data.
        </div>
      )}

      {/* Platform total(s) — one card per currency, never summed together */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))
        ) : totals.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-sm text-gray-400">
            No Meta spend data for this period.
          </div>
        ) : (
          totals.map((t) => (
            <div key={t.currency} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl mb-3" style={{ backgroundColor: '#FFF7ED' }}>
                <Wallet className="h-4 w-4" style={{ color: CHART_COLOR }} />
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(t.total, t.currency)}</p>
              <p className="text-xs text-gray-400 mt-1">Platform total — {t.currency}</p>
            </div>
          ))
        )}
      </div>

      {/* Spend over time */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Spend Over Time</h3>
            <p className="text-xs text-gray-400 mt-0.5">All workspaces combined, per day</p>
          </div>
          {currenciesInSeries.length > 1 && (
            <div className="flex gap-1">
              {currenciesInSeries.map((c) => (
                <button
                  key={c}
                  onClick={() => setChartCurrency(c)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[11px] font-medium border',
                    c === activeCurrency ? 'text-white border-transparent' : 'text-gray-500 border-gray-200',
                  )}
                  style={c === activeCurrency ? { backgroundColor: CHART_COLOR } : {}}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : chartSeries.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-sm text-gray-400">No data for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartSeries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gAdminSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLOR} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtDay} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={64}
                tickFormatter={(v: number) => formatCurrency(v, activeCurrency ?? 'INR')} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
                labelFormatter={(l: string) => fmtDay(l)}
                formatter={(v: number) => [formatCurrency(v, activeCurrency ?? 'INR'), 'Spend']}
              />
              <Area type="monotone" dataKey="cost" name="Spend" stroke={CHART_COLOR} fill="url(#gAdminSpend)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top spenders */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="h-4 w-4" style={{ color: CHART_COLOR }} />
            <h3 className="text-sm font-semibold text-gray-800">Top Spenders</h3>
          </div>
          <div className="space-y-3">
            {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            {!isLoading && topSpenders.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No spend data for this period.</p>
            )}
            {topSpenders.map((c, i) => (
              <div key={`${c.workspace_id}-${c.currency}`} className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-bold text-gray-300 w-4 shrink-0">#{i + 1}</span>
                  <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-500 shrink-0">
                    {c.name?.[0]?.toUpperCase() ?? 'W'}
                  </div>
                  <span className="font-medium text-gray-800 truncate">{c.name}</span>
                </div>
                <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0 ml-2">{formatCurrency(c.total, c.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent sync failures */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-gray-800">Recent Sync Failures</h3>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            {!isLoading && failures.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No sync failures — all workspaces healthy.</p>
            )}
            {failures.map((f, i) => (
              <div key={`${f.workspace_id}-${f.created_at}-${i}`} className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-800 truncate">{f.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{formatDate(f.created_at)}</span>
                </div>
                <p className="text-xs text-red-600 mt-0.5 line-clamp-2">{f.error || 'Unknown error'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By-client table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Spend by Client</h3>
            <p className="text-xs text-gray-400 mt-0.5">All clients with Meta spend in this period</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <TrendingUp className="h-3.5 w-3.5" /> Sorted by spend, highest first
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Currency</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Spend</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Synced</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                {Array.from({ length: 4 }).map((__, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && byClient.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-sm text-gray-400 py-12">
                  No Meta spend data for this period.
                </td>
              </tr>
            )}
            {byClient.map((c) => (
              <tr key={`${c.workspace_id}-${c.currency}`} className="border-b border-gray-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-500 shrink-0">
                      {c.name?.[0]?.toUpperCase() ?? 'W'}
                    </div>
                    <span className="font-medium text-gray-800">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-gray-500">{c.currency}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(c.total, c.currency)}</td>
                <td className="px-5 py-3 text-right text-gray-400 text-xs">{formatDate(c.last_synced_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

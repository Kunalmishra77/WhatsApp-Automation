'use client';

import { useMemo, useState } from 'react';
import {
  Receipt, RefreshCw, Download, TrendingUp, TrendingDown, CalendarDays,
  Megaphone, ShieldCheck, KeyRound, LifeBuoy, Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { resolveRange } from '@/lib/meta-spend';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useMetaSpend } from '../../hooks/useMetaSpend';
import { SpendChart } from './SpendChart';
import { HistoryTable } from './HistoryTable';

// ── Quick date filters ──────────────────────────────────────────────────────
// Keys mirror lib/meta-spend.ts#resolveRange exactly so the client-resolved
// {from,to} always matches what the server would resolve for the same key.
const QUICK_RANGES: Array<{ key: string; label: string }> = [
  { key: 'today',        label: 'Today' },
  { key: 'yesterday',    label: 'Yesterday' },
  { key: 'last_7_days',  label: 'Last 7 Days' },
  { key: 'this_week',    label: 'This Week' },
  { key: 'last_week',    label: 'Last Week' },
  { key: 'this_month',   label: 'This Month' },
  { key: 'last_month',   label: 'Last Month' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'last_90_days', label: 'Last 90 Days' },
  { key: 'this_year',    label: 'This Year' },
];

const CATEGORY_ROWS: Array<{ key: string; label: string; icon: React.ElementType; color: string }> = [
  { key: 'MARKETING',      label: 'Marketing',      icon: Megaphone,  color: 'text-orange-600 bg-orange-100' },
  { key: 'UTILITY',        label: 'Utility',        icon: ShieldCheck, color: 'text-sky-600 bg-sky-100' },
  { key: 'AUTHENTICATION', label: 'Authentication', icon: KeyRound,   color: 'text-violet-600 bg-violet-100' },
  { key: 'SERVICE',        label: 'Service',        icon: LifeBuoy,   color: 'text-emerald-600 bg-emerald-100' },
];

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR' }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency || ''}`.trim();
  }
}

function formatSynced(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function MetaSpendDashboard() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [quickKey, setQuickKey] = useState('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const useCustom = !!customFrom && !!customTo;
  const { from, to } = useMemo(
    () => (useCustom ? { from: customFrom, to: customTo } : resolveRange(quickKey, new Date())),
    [useCustom, customFrom, customTo, quickKey],
  );

  const { summary, series, history, currency, loading, error, refreshing, refresh } =
    useMetaSpend(workspaceId, from, to);

  const fmt = (n: number) => formatCurrency(n, currency);

  const handleQuickPick = (key: string) => {
    setQuickKey(key);
    setCustomFrom('');
    setCustomTo('');
  };

  const handleDownload = () => {
    if (!workspaceId) return;
    window.open(`/api/billing/meta-spend/export?workspaceId=${encodeURIComponent(workspaceId)}&from=${from}&to=${to}`, '_blank');
  };

  const pct = summary?.pct_change ?? null;
  const isEmpty = !loading && !error && (summary?.period_cost ?? 0) === 0 && series.length === 0 && history.length === 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between flex-wrap gap-3 border-b border-border bg-card/95 backdrop-blur px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 shrink-0">
            <Receipt className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">Billing &amp; Meta Spend</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Meta conversation-based pricing costs for this workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={refreshing || !workspaceId} onClick={() => void refresh()}>
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!workspaceId} onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </div>

      {/* ── Scrollable Body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Date filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex flex-wrap rounded-lg border border-border overflow-hidden">
            {QUICK_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => handleQuickPick(r.key)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap',
                  !useCustom && quickKey === r.key ? 'bg-brand-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
            <span>to</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-[140px] text-xs" />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {!workspaceId ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Select a workspace to view billing data.</div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No Meta billing data for this period.</div>
        ) : (
          <>
            {/* ══ Headline + KPI cards ═════════════════════════════════════ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="col-span-2 sm:col-span-1">
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground mb-1">Period Total</p>
                  {loading ? <Skeleton className="h-7 w-24 mb-1" /> : (
                    <p className="text-2xl font-bold leading-tight tabular-nums">{fmt(summary?.period_cost ?? 0)}</p>
                  )}
                  {!loading && pct !== null && (
                    <p className={cn('text-[11px] font-medium mt-1 flex items-center gap-1', pct >= 0 ? 'text-red-500' : 'text-green-600')}>
                      {pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(pct)}% vs previous period
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground mb-1">Today</p>
                  {loading ? <Skeleton className="h-7 w-16 mb-1" /> : (
                    <p className="text-2xl font-bold leading-tight tabular-nums">{fmt(summary?.today ?? 0)}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground mb-1">This Week</p>
                  {loading ? <Skeleton className="h-7 w-16 mb-1" /> : (
                    <p className="text-2xl font-bold leading-tight tabular-nums">{fmt(summary?.this_week ?? 0)}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground mb-1">This Month</p>
                  {loading ? <Skeleton className="h-7 w-16 mb-1" /> : (
                    <p className="text-2xl font-bold leading-tight tabular-nums">{fmt(summary?.this_month ?? 0)}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ══ Spend over time ══════════════════════════════════════════ */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Spend Over Time</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <SpendChart data={series} loading={loading} formatCurrency={fmt} />
              </CardContent>
            </Card>

            {/* ══ Category breakdown ═══════════════════════════════════════ */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {loading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {CATEGORY_ROWS.map((c) => (
                      <div key={c.key} className="flex items-center gap-2.5 rounded-lg border border-border p-3">
                        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', c.color)}>
                          <c.icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground truncate">{c.label}</p>
                          <p className="text-sm font-semibold tabular-nums">{fmt(summary?.breakdown?.[c.key] ?? 0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ══ Billing history ══════════════════════════════════════════ */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Billing History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <HistoryTable rows={history} loading={loading} formatCurrency={fmt} />
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Last synced ────────────────────────────────────────────────── */}
        <p className="text-xs text-muted-foreground">
          Last synced: {formatSynced(summary?.last_synced_at ?? null)}
        </p>

        {/* ── Disclaimer ─────────────────────────────────────────────────── */}
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>
            <span className="font-medium text-foreground">Meta Reported Spend</span> — usage-based figures reported by Meta;
            taxes/credits on your final invoice may differ.
          </p>
        </div>
      </div>
    </div>
  );
}

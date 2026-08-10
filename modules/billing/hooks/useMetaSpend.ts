'use client';

import { useCallback, useEffect, useState } from 'react';

export interface SpendPeriod { from: string; to: string; }

export interface SpendSummary {
  currency: string;
  period: SpendPeriod;
  period_cost: number;
  pct_change: number | null;
  today: number;
  this_week: number;
  this_month: number;
  total: number;
  breakdown: Record<string, number>;
  last_synced_at: string | null;
}

export interface SpendSeriesPoint { label: string; cost: number; }

export interface SpendHistoryRow { day: string; category: string; volume: number; cost: number; }

interface MetaSpendState {
  summary:    SpendSummary | null;
  series:     SpendSeriesPoint[];
  history:    SpendHistoryRow[];
  currency:   string;
  loading:    boolean;
  error:      string | null;
  refreshing: boolean;
}

const INITIAL_STATE: MetaSpendState = {
  summary: null, series: [], history: [], currency: '', loading: true, error: null, refreshing: false,
};

// Fetches summary + series + history together for the given workspace/period,
// and exposes a `refresh` action that POSTs /refresh (triggers a fresh Meta
// pull) before re-fetching. Kept as a plain useState/useEffect hook (matching
// modules/campaigns/components/CampaignRetention's pattern) rather than
// react-query, since the three endpoints always move together as one unit.
export function useMetaSpend(workspaceId: string | undefined, from: string, to: string) {
  const [state, setState] = useState<MetaSpendState>(INITIAL_STATE);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const qs = `workspaceId=${encodeURIComponent(workspaceId)}&from=${from}&to=${to}`;
      const [summaryRes, seriesRes, historyRes] = await Promise.all([
        fetch(`/api/billing/meta-spend/summary?${qs}`),
        fetch(`/api/billing/meta-spend/series?${qs}&bucket=day`),
        fetch(`/api/billing/meta-spend/history?${qs}`),
      ]);
      if (!summaryRes.ok || !seriesRes.ok || !historyRes.ok) {
        throw new Error('Failed to load billing data');
      }
      const [summary, series, history] = await Promise.all([
        summaryRes.json() as Promise<SpendSummary>,
        seriesRes.json() as Promise<{ series: SpendSeriesPoint[]; currency: string }>,
        historyRes.json() as Promise<{ rows: SpendHistoryRow[]; currency: string }>,
      ]);
      setState({
        summary,
        series: series.series ?? [],
        history: history.rows ?? [],
        currency: summary.currency || series.currency || history.currency || '',
        loading: false,
        error: null,
        refreshing: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false, error: 'Could not load billing data. Please try again.' }));
    }
  }, [workspaceId, from, to]);

  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setState((s) => ({ ...s, refreshing: true }));
    try {
      await fetch('/api/billing/meta-spend/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
    } catch {
      // Ignore transport errors here — the re-fetch below still surfaces
      // whatever data is currently in meta_spend_daily.
    } finally {
      await load();
    }
  }, [workspaceId, load]);

  return { ...state, reload: load, refresh };
}

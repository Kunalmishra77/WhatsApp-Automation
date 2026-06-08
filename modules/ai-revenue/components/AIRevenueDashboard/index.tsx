'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace.store';
import {
  TrendingUp, Flame, Clock, Users, RefreshCw, MessageSquare,
  Star, ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContactInsight {
  lead_score:       number;
  hot_lead:         boolean;
  buy_signals:      string[];
  best_send_hour:   number | null;
  insights_summary: string | null;
  last_analyzed_at: string;
  contacts: {
    id:              string;
    name:            string | null;
    phone:           string;
    lifecycle_stage: string | null;
    is_vip:          boolean;
  };
}

interface Summary {
  total_analyzed:   number;
  total_hot_leads:  number;
  avg_score:        number;
  best_global_hour: number | null;
  last_analyzed_at: string | null;
}

interface InsightsData {
  summary:   Summary;
  hot_leads: ContactInsight[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatHour(h: number | null): string {
  if (h === null) return '—';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-red-100 text-red-700 border-red-200';
  if (score >= 65) return 'bg-orange-100 text-orange-700 border-orange-200';
  if (score >= 50) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-blue-100 text-blue-700 border-blue-200';
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Very Hot';
  if (score >= 65) return 'Hot';
  if (score >= 50) return 'Warm';
  return 'Lukewarm';
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-red-500'
    : score >= 65 ? 'bg-orange-500'
    : score >= 50 ? 'bg-amber-500'
    : 'bg-blue-400';
  return (
    <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${score}%` }} />
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function AIRevenueDashboard() {
  const workspace   = useWorkspaceStore((s) => s.activeWorkspace);
  const workspaceId = workspace?.id ?? '';

  const [data, setData]         = useState<InsightsData | null>(null);
  const [loading, setLoading]   = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/revenue/insights?workspaceId=${workspaceId}`);
      if (res.ok) setData(await res.json() as InsightsData);
    } catch {
      toast.error('Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  async function handleAnalyze() {
    if (!workspaceId) return;
    setAnalyzing(true);
    toast.info('Analyzing contacts… this may take 30–60 seconds.');
    try {
      const res  = await fetch('/api/ai/revenue/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const d = await res.json() as { analyzed?: number; error?: string };
      if (res.ok) {
        toast.success(`✅ Analyzed ${d.analyzed ?? 0} contacts!`);
        await fetchInsights();
      } else {
        toast.error(d.error ?? 'Analysis failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setAnalyzing(false);
    }
  }

  const summary   = data?.summary;
  const hotLeads  = data?.hot_leads ?? [];
  const hasData   = (summary?.total_analyzed ?? 0) > 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface-secondary">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-heading-lg font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-brand-500" />
              AI Revenue Intelligence
            </h1>
            <p className="mt-1 text-body-md text-muted-foreground">
              AI-powered lead scoring, buy-signal detection, and best-time-to-send prediction.
            </p>
            {summary?.last_analyzed_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                Last analyzed: {new Date(summary.last_analyzed_at).toLocaleString()}
              </p>
            )}
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing || loading} className="gap-2 shrink-0">
            {analyzing
              ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Analyzing…</>
              : <><RefreshCw className="h-3.5 w-3.5" /> {hasData ? 'Re-analyze' : 'Run Analysis'}</>}
          </Button>
        </div>

        {/* ── Summary cards ── */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon={<Flame className="h-5 w-5 text-red-500" />}
              label="Hot Leads"
              value={summary?.total_hot_leads ?? '—'}
              sub="score ≥ 65"
              highlight
            />
            <StatCard
              icon={<Users className="h-5 w-5 text-brand-500" />}
              label="Analyzed"
              value={summary?.total_analyzed ?? '—'}
              sub="contacts"
            />
            <StatCard
              icon={<ChevronUp className="h-5 w-5 text-emerald-500" />}
              label="Avg Score"
              value={summary?.avg_score != null ? `${summary.avg_score}/100` : '—'}
              sub="lead score"
            />
            <StatCard
              icon={<Clock className="h-5 w-5 text-amber-500" />}
              label="Best Time"
              value={formatHour(summary?.best_global_hour ?? null)}
              sub="to send messages"
            />
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !hasData && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
              <TrendingUp className="h-8 w-8 text-brand-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">No insights yet</p>
              <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                Click "Run Analysis" to score your contacts with AI — takes about 30–60 seconds.
              </p>
            </div>
            <Button onClick={handleAnalyze} disabled={analyzing} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Run Analysis
            </Button>
          </div>
        )}

        {/* ── Hot Leads table ── */}
        {!loading && hotLeads.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-6 py-4 flex items-center gap-2">
              <Flame className="h-4 w-4 text-red-500" />
              <h2 className="text-sm font-semibold text-foreground">Hot Leads (score ≥ 50)</h2>
              <Badge variant="outline" className="ml-auto text-xs">{hotLeads.length} contacts</Badge>
            </div>

            <div className="divide-y divide-border">
              {hotLeads.map((item) => {
                const contact = item.contacts;
                const name    = contact?.name ?? contact?.phone ?? 'Unknown';
                return (
                  <div key={contact?.id} className="flex items-start gap-4 px-6 py-4 hover:bg-muted/30 transition-colors">

                    {/* Avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold mt-0.5">
                      {name.slice(0, 2).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{name}</p>
                        {contact?.is_vip && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                        {contact?.lifecycle_stage && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize border border-border/60">
                            {contact.lifecycle_stage}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{contact?.phone}</p>

                      {/* Buy signals */}
                      {item.buy_signals?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.buy_signals.map((sig) => (
                            <span key={sig} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                              {sig}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* AI summary */}
                      {item.insights_summary && (
                        <p className="mt-1.5 text-xs text-muted-foreground italic">"{item.insights_summary}"</p>
                      )}
                    </div>

                    {/* Score + time + action */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-xs font-bold', scoreColor(item.lead_score))}>
                          {item.lead_score}
                        </Badge>
                        <span className={cn('text-xs font-medium', scoreColor(item.lead_score).split(' ')[1])}>
                          {scoreLabel(item.lead_score)}
                        </span>
                      </div>
                      <ScoreBar score={item.lead_score} />
                      {item.best_send_hour !== null && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Best: {formatHour(item.best_send_hour)}
                        </div>
                      )}
                      <a
                        href={`/contacts?highlight=${contact?.id}`}
                        className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                      >
                        <MessageSquare className="h-3 w-3" /> Message
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border p-5 bg-card transition-all',
      highlight ? 'border-red-200 bg-red-50/50' : 'border-border',
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">{icon}</div>
      </div>
      <p className={cn('text-2xl font-bold', highlight ? 'text-red-700' : 'text-foreground')}>{value}</p>
      <p className="text-xs font-semibold text-foreground mt-0.5">{label}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BotHealthRow, BotHealthVerdict, Level } from '@/lib/bot-health';

type Row = BotHealthRow & { verdict: BotHealthVerdict };

interface Payload {
  days: number;
  rows: Row[];
  summary: { clients: number; needsAttention: number; refusals: number; refusedPeople: number; fallbacks: number };
}

const LEVEL_ICON: Record<Level, React.ElementType> = {
  ok: CheckCircle2, warn: AlertTriangle, bad: XCircle,
};
const LEVEL_TEXT: Record<Level, string> = {
  ok: 'text-emerald-600', warn: 'text-amber-500', bad: 'text-red-600',
};
const LEVEL_CELL: Record<Level, string> = {
  ok: 'text-gray-700', warn: 'text-amber-600 font-semibold', bad: 'text-red-600 font-bold',
};

const RANGES = [1, 7, 30] as const;

export function BotHealth() {
  const [days, setDays] = useState<number>(7);

  const { data, isLoading, isFetching, refetch } = useQuery<Payload>({
    queryKey: ['admin', 'bot-health', days],
    queryFn: () => fetch(`/api/admin/bot-health?days=${days}`).then((r) => r.json()),
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-gray-500 py-10 justify-center">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading bot health…
    </div>;
  }

  const rows = data?.rows ?? [];
  const s = data?.summary;

  return (
    <div className="space-y-4">
      {/* Range + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                days === d
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300',
              )}
            >
              {d === 1 ? 'Today' : `${d} days`}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isFetching && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {/* Summary */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Clients needing attention', value: s.needsAttention, bad: s.needsAttention > 0 },
            { label: 'Customers turned away',      value: s.refusedPeople,  bad: s.refusedPeople > 0 },
            { label: 'Refusals sent',              value: s.refusals,       bad: s.refusals > 0 },
            { label: 'AI failures',                value: s.fallbacks,      bad: s.fallbacks > 0 },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
              <p className={cn('text-2xl font-bold tabular-nums', c.bad ? 'text-red-600' : 'text-gray-900')}>
                {c.value}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Per-client table */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1.6fr_repeat(4,0.8fr)] gap-2 px-4 py-2.5 border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
          <span>Client</span>
          <span className="text-right">Replies</span>
          <span className="text-right">Refused</span>
          <span className="text-right">AI failed</span>
          <span className="text-right">Reply time</span>
        </div>

        {rows.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-10">No bot activity in this period.</p>
        )}

        {rows.map((r) => {
          const Icon = LEVEL_ICON[r.verdict.worst];
          return (
            <div key={r.workspace_id} className="border-b border-gray-50 last:border-0 px-4 py-3">
              <div className="grid grid-cols-2 sm:grid-cols-[1.6fr_repeat(4,0.8fr)] gap-2 items-center">
                <div className="flex items-center gap-2 min-w-0 col-span-2 sm:col-span-1">
                  <Icon className={cn('h-4 w-4 shrink-0', LEVEL_TEXT[r.verdict.worst])} />
                  <span className="text-sm font-medium text-gray-900 truncate">{r.workspace_name}</span>
                </div>
                <span className="text-sm text-gray-700 text-right tabular-nums">{r.bot_replies}</span>
                <span className={cn('text-sm text-right tabular-nums', LEVEL_CELL[r.verdict.refusalLevel])}>
                  {r.verdict.refusalPct}%
                </span>
                <span className={cn('text-sm text-right tabular-nums', LEVEL_CELL[r.verdict.fallbackLevel])}>
                  {r.fallbacks}
                </span>
                <span className={cn('text-sm text-right tabular-nums', LEVEL_CELL[r.verdict.latencyLevel])}>
                  {r.median_reply_sec === null ? '—' : `${r.median_reply_sec}s`}
                </span>
              </div>

              {/* Says what is wrong in words, so the number does not have to be
                  interpreted before anyone can act on it. */}
              {r.verdict.headline && (
                <p className={cn('text-xs mt-1.5 flex items-center gap-1.5', LEVEL_TEXT[r.verdict.worst])}>
                  <Users className="h-3 w-3 shrink-0" />
                  {r.verdict.headline}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        <Bot className="h-3 w-3 inline mr-1" />
        <b>Refused</b> is the share of replies where the bot told a customer it can only help with
        that business — detected from the reply text, so it is an indication rather than an exact
        count. <b>AI failed</b> counts replies that fell back to &ldquo;our team will get back to
        you&rdquo; because the AI call itself failed. <b>Reply time</b> is the median wait for a
        customer; around 11s is normal here.
      </p>
    </div>
  );
}

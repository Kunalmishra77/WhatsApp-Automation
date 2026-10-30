'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { X, Loader2, TrendingDown, AlertTriangle, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { summariseDropoff, type DropoffStep } from '@/lib/flow-dropoff';

// Where customers leave this flow.
//
// A completion rate says people are leaving; only this says where. A step with
// 90 arrivals and 80 stops is invisible in any count of completions, and it is
// the one line in the flow worth rewriting.
//
// The bar is arrivals as a share of the busiest step, so the shape of the list
// reads as the funnel it is. The stop count sits beside it, because a step can
// be busy and fine or quiet and fatal and the bar alone cannot tell them apart.

interface Props {
  flowId: string;
  onClose: () => void;
  /** Lets clicking a step select it on the canvas, as the warnings list does. */
  onSelect?: (nodeId: string) => void;
}

interface Payload {
  totals: { sessions: number; active: number; expired: number };
  steps: DropoffStep[];
}

const RANGES = [
  ['this_month', 'This month'],
  ['last_30_days', 'Last 30 days'],
  ['this_week', 'This week'],
  ['today', 'Today'],
] as const;

export function FlowDropoff({ flowId, onClose, onSelect }: Props) {
  const [range, setRange] = useState<string>('this_month');

  const { data, isLoading, isError, error } = useQuery<Payload>({
    queryKey: ['flow', 'dropoff', flowId, range],
    queryFn: () =>
      fetch(`/api/flows/${flowId}/analytics?range=${range}`).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? 'Could not load the numbers.');
        return body as Payload;
      }),
    retry: false,
    staleTime: 60_000,
  });

  const steps = data?.steps ?? [];
  const busiest = steps.reduce((max, s) => Math.max(max, s.reached), 0);

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Where people leave</p>
          <p className="text-[11px] text-muted-foreground">Sessions that started in this period</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border bg-card px-3 py-2">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGES.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Said rather than rendered as zeros: a flow nobody has used and a flow
          whose numbers failed to load look identical, and only one is news. */}
      {isError && (
        <div className="flex flex-1 items-start gap-2 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : 'Could not load the numbers.'}
          </p>
        </div>
      )}

      {data && (
        <>
          <p className="border-b border-border bg-card px-3 py-2 text-xs leading-relaxed text-foreground">
            {summariseDropoff(steps, data.totals.sessions)}
          </p>

          <div className="flex-1 overflow-y-auto p-3">
            {steps.length === 0 && (
              <p className="text-xs text-muted-foreground">This flow has no steps yet.</p>
            )}
            <ol className="space-y-2">
              {steps.map((s) => {
                const width = busiest > 0 ? Math.max(2, Math.round((s.reached / busiest) * 100)) : 0;
                return (
                  <li key={s.nodeId}>
                    <button
                      type="button"
                      onClick={() => onSelect?.(s.nodeId)}
                      className="w-full rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-foreground">
                          {s.isEnding && <Flag className="h-3 w-3 shrink-0 text-emerald-600" />}
                          {s.isWorst && <TrendingDown className="h-3 w-3 shrink-0 text-red-500" />}
                          <span className="truncate">{s.label}</span>
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {s.reached}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${s.isEnding ? 'bg-emerald-400' : s.isWorst ? 'bg-red-400' : 'bg-brand-400'}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      {s.stopped > 0 && (
                        <p className={`mt-0.5 text-[10px] ${s.isEnding ? 'text-emerald-600' : s.isWorst ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {s.isEnding
                            ? `${s.stopped} finished here`
                            : `${s.stopped} stopped here (${s.stoppedPct}%)`}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>

            {data.totals.active > 0 && (
              <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
                {data.totals.active} {data.totals.active === 1 ? 'person is' : 'people are'} still
                mid-flow, so their last step is counted as a stop for now.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

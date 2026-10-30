// lib/flow-dropoff.ts
//
// Turns the per-step counts from `flow_dropoff` into the list a client reads.
//
// Pure, so the judgements in it — which stop is a loss and which is the flow
// working, and when a number is too small to draw a conclusion from — are
// tested rather than only looked at.

/** A row of `flow_dropoff` (migration 140). */
export interface DropoffRow {
  node_id: string;
  reached: number | string;
  stopped: number | string;
}

export interface DropoffStep {
  nodeId: string;
  label: string;
  type: string;
  reached: number;
  stopped: number;
  /** Stops as a share of arrivals, 0-100. */
  stoppedPct: number;
  /**
   * True where stopping is the flow working: an End or a handoff is where a
   * session is supposed to finish. Marking these is what keeps a successful
   * flow from reading as 100% drop-off at its last step.
   */
  isEnding: boolean;
  /**
   * The worst genuine loss, if there is one. Only ever set on a non-ending
   * step, and only when there is enough traffic for the number to mean
   * something — calling a step with 3 arrivals the problem is how a report
   * sends someone off to rewrite the wrong message.
   */
  isWorst: boolean;
}

/** Steps where a session finishing is the intended outcome. */
const ENDINGS: ReadonlySet<string> = new Set(['end', 'assign_agent']);

/**
 * Below this many arrivals a step's stop rate is not reported as the worst
 * one. Ten is a judgement, not a calculation: it is the point at which the
 * difference between "people leave here" and "two people left" stops being
 * noise, for flows that see tens of sessions a month rather than thousands.
 */
export const MIN_TRAFFIC_TO_BLAME = 10;

function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Every step of the flow, in the flow's own order, with its arrivals and stops.
 *
 * Steps with no sessions are kept rather than dropped. A step nobody reached is
 * a finding too — more often than not it is the step after the one people are
 * leaving at.
 */
export function buildDropoff(
  nodes: Array<{ id: string; type?: string; data?: unknown }>,
  rows: DropoffRow[],
): DropoffStep[] {
  const byNode = new Map(rows.map((r) => [r.node_id, r]));

  const steps: DropoffStep[] = nodes
    // The Start node is where every session begins by definition, so its
    // arrival count is the session count and its stop count is always zero.
    // Listing it adds a row that can only ever say the same thing.
    .filter((n) => n.type !== 'start')
    .map((n) => {
      const row = byNode.get(n.id);
      const reached = num(row?.reached);
      const stopped = num(row?.stopped);
      const label = (n.data as { label?: string } | undefined)?.label?.trim();
      return {
        nodeId: n.id,
        label: label || (n.type ?? 'step').replace(/_/g, ' '),
        type: n.type ?? 'step',
        reached,
        stopped,
        stoppedPct: reached > 0 ? Math.round((stopped / reached) * 100) : 0,
        isEnding: ENDINGS.has(n.type ?? ''),
        isWorst: false,
      };
    });

  let worst: DropoffStep | null = null;
  for (const step of steps) {
    if (step.isEnding || step.stopped === 0) continue;
    if (step.reached < MIN_TRAFFIC_TO_BLAME) continue;
    if (!worst || step.stopped > worst.stopped) worst = step;
  }
  if (worst) worst.isWorst = true;

  return steps;
}

/**
 * One sentence for the top of the panel.
 *
 * It says what to do, or says plainly that it cannot tell yet. A report that
 * fills the gap with a confident-looking 0% is worse than one that admits the
 * flow has not run enough times.
 */
export function summariseDropoff(
  steps: DropoffStep[],
  sessions: number,
): string {
  if (sessions === 0) return 'Nobody has been through this flow in this period.';

  const finished = steps
    .filter((s) => s.isEnding)
    .reduce((sum, s) => sum + s.stopped, 0);
  const rate = Math.round((finished / sessions) * 100);

  const worst = steps.find((s) => s.isWorst);
  const base = `${sessions} ${sessions === 1 ? 'person' : 'people'} started, ${rate}% reached the end.`;

  if (worst) {
    return `${base} Most leave at "${worst.label}" — ${worst.stopped} of ${worst.reached} stop there.`;
  }
  if (sessions < MIN_TRAFFIC_TO_BLAME) {
    return `${base} Too few so far to say where people are dropping out.`;
  }
  return base;
}

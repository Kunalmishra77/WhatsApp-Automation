import type { NodeHandler } from './types';
import { matchesCondition, placeholdersIn } from './pure';

// A branch with more than two ways out.
//
// Built because a Condition only answers yes or no, so "which service are they
// asking about?" was drawn as three Conditions in a row — and every one of them
// judged the same message, so the author had to reason about which test ran
// first to know what the flow did. One node with one subject and an ordered
// list of cases says the same thing in a way that can be read.
//
// Cases are tried in order and the first match wins, which is the rule the
// chained Conditions had implicitly. `default` is where everything else goes;
// it is a real branch, not a fallthrough, because a many-way branch with no
// answer for "none of these" is the half of the flow people forget.

export interface SwitchCase {
  id: string;
  /** What to match against the subject. */
  match: string;
  /** The author's own name for the branch, shown on the canvas. */
  label?: string;
}

export interface SwitchNodeData {
  label?: string;
  /** What to judge: the message that just arrived, or a saved answer. */
  source?: 'reply' | 'variable';
  /** Read when `source` is 'variable'. */
  variable?: string;
  matchType?: 'contains' | 'equals' | 'starts_with';
  cases?: SwitchCase[];
}

/** The handle an edge must carry to be the branch for this case. */
export const caseHandle = (id: string) => `case_${id}`;

export const DEFAULT_HANDLE = 'default';

function cases(d: SwitchNodeData): SwitchCase[] {
  return (d.cases ?? []).filter((c) => c && typeof c.id === 'string' && c.id.length > 0);
}

/**
 * What this node judges. A variable is read through the same `_text` preference
 * as interpolation, so a switch on a saved answer matches the words the
 * customer actually typed rather than the number they were parsed into.
 */
function subject(d: SwitchNodeData, incoming: string, vars: Readonly<Record<string, number | string>>): string {
  if (d.source !== 'variable') return incoming;
  const name = d.variable ?? '';
  const asText = vars[`${name}_text`];
  if (asText !== undefined && asText !== null && String(asText).length > 0) return String(asText);
  const raw = vars[name];
  return raw === undefined || raw === null ? '' : String(raw);
}

export const switchHandler: NodeHandler = {
  type: 'switch',

  handles(data) {
    const d = (data ?? {}) as SwitchNodeData;
    return [...cases(d).map((c) => caseHandle(c.id)), DEFAULT_HANDLE];
  },

  async run(ctx) {
    const d = (ctx.node.data ?? {}) as SwitchNodeData;
    const value = subject(d, ctx.incoming, ctx.vars);
    const matchType = d.matchType ?? 'contains';

    // The case is interpolated, so a branch can be written against a saved
    // answer — "is it the same city they told us earlier?" — which is the one
    // comparison a Condition cannot make at all.
    const hit = cases(d).find((c) => matchesCondition(value, ctx.interpolate(c.match ?? ''), matchType));
    return { outcome: { next: 'edge', handle: hit ? caseHandle(hit.id) : DEFAULT_HANDLE } };
  },

  describe(data) {
    const d = (data ?? {}) as SwitchNodeData;
    const reads = d.source === 'variable' && d.variable ? [d.variable] : [];
    // A case can be written as {{saved_answer}}, so those count as reads too.
    const inCases = cases(d).flatMap((c) => placeholdersIn(c.match));
    return { readsVars: [...new Set([...reads, ...inCases])] };
  },
};

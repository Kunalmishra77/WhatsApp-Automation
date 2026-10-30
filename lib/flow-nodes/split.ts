import type { NodeHandler, FlowContext } from './types';

// Sends each customer down one of several branches, by weight. An A/B test.
//
// The choice is made from the session id and the node id, not from a random
// number, and that is the whole design:
//
//  * A session that is resumed — a customer who replies the next morning —
//    takes the same branch it took yesterday. With Math.random a customer could
//    be shown variant A, go quiet, and come back into variant B, which is both a
//    confusing conversation and a result that means nothing.
//  * The editor's simulator takes the same branch as production for the same
//    session, so "Try it" shows what will actually happen.
//  * A test can assert which branch a given session gets.
//
// The chosen variant is saved as `split_<nodeId>` so the rest of the flow can
// read it and a report can group by it. That is what makes this an experiment
// rather than a coin toss nobody can measure.

export interface SplitVariant {
  id: string;
  /** The author's own name for the branch. */
  label?: string;
  /** Relative share. Omitted behaves as 1, so an unweighted split is even. */
  weight?: number;
}

export interface SplitNodeData {
  label?: string;
  variants?: SplitVariant[];
}

/** The handle an edge must carry to be the branch for this variant. */
export const variantHandle = (id: string) => `variant_${id}`;

/** The context key the chosen variant is saved under. */
export const splitVarFor = (nodeId: string) => `split_${nodeId}`;

function variants(d: SplitNodeData): SplitVariant[] {
  return (d.variants ?? []).filter((v) => v && typeof v.id === 'string' && v.id.length > 0);
}

/**
 * FNV-1a over the two ids, then a finalizer. A non-cryptographic hash is the
 * right tool: it only has to spread evenly and give the same answer every time.
 *
 * Both details below were found by a test, not by reading:
 *
 *  * `Math.imul`, not `*`. A 32-bit hash times the FNV prime is about 2^56,
 *    past the 2^53 a double holds exactly, so the low bits were being rounded
 *    away before `>>> 0` could truncate them.
 *  * The fmix32 finalizer. FNV-1a's last byte reaches the low bits of the
 *    result and barely touches the high ones — and the high bits are what
 *    decides the arm, since this divides by 2^32. Two splits in one flow
 *    ("sess:sp-1", "sess:sp-2") differ only in that last byte, so without the
 *    finalizer every session took the SAME arm in both of them: an A/B test
 *    whose two experiments silently measured the same half of the audience.
 */
export function splitHash(sessionId: string, nodeId: string): number {
  const input = `${sessionId}:${nodeId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // fmix32 — carries every bit of difference across the whole word.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

/**
 * Which variant this session belongs in. Exported so the editor and any report
 * can answer the question without running the flow.
 *
 * A weight of zero means "retired, keep the branch wired but send nobody" — the
 * honest way to end an experiment without deleting the losing arm while
 * sessions are still parked inside it.
 */
export function chooseVariant(
  list: SplitVariant[],
  sessionId: string,
  nodeId: string,
): SplitVariant | null {
  const usable = list.filter((v) => (v.weight ?? 1) > 0);
  if (usable.length === 0) return null;

  const total = usable.reduce((sum, v) => sum + (v.weight ?? 1), 0);
  let point = splitHash(sessionId, nodeId) * total;
  for (const v of usable) {
    point -= v.weight ?? 1;
    if (point < 0) return v;
  }
  // Floating-point rounding only: the loop above covers the whole range.
  return usable[usable.length - 1]!;
}

export const splitHandler: NodeHandler = {
  type: 'split',

  handles(data) {
    return variants((data ?? {}) as SplitNodeData).map((v) => variantHandle(v.id));
  },

  async run(ctx) {
    const d = (ctx.node.data ?? {}) as SplitNodeData;
    const chosen = chooseVariant(variants(d), ctx.sessionId, ctx.node.id);

    // No variants, or every one retired. Follows the plain outgoing edge rather
    // than stopping, so a split that has been switched off behaves like the
    // straight line it has become.
    if (!chosen) return { outcome: { next: 'edge' } };

    const setVars: FlowContext = { [splitVarFor(ctx.node.id)]: chosen.id };
    return { outcome: { next: 'edge', handle: variantHandle(chosen.id) }, setVars };
  },

  // No `describe`: the variable it writes is named after the node id, and
  // `describe(data)` is given only the data. Returning a placeholder name would
  // put a variable in the validator's list that no placeholder can ever match.
  // `splitVarFor` is exported for anything that knows the id and needs it.
};

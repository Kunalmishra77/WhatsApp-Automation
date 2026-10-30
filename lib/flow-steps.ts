// lib/flow-steps.ts
//
// A flow as a list of steps, for the people who never wanted a canvas.
//
// Of the eighteen flows the twelve workspaces have built, eight are two to four
// nodes and every one of those is a straight line: start, a message, sometimes
// an end. Those clients opened a node editor to write a single auto-reply.
//
// A straight-line flow is exactly the kind that reads better as "when this
// happens → send this → ask this → do this". Anything that branches does not,
// and this says so plainly rather than flattening it and losing a branch.
//
// Node ids are preserved through the round trip. Rebuilding them would orphan
// every edge the canvas had drawn, and would break any flow_session parked on a
// node id that no longer exists.

import type { FlowNode, FlowEdge, FlowNodeType } from '@/modules/flows/types';

export interface FlowStep {
  id: string;
  type: FlowNodeType;
  data: unknown;
}

export type StepsResult =
  | { ok: true; start: FlowNode; steps: FlowStep[] }
  /** `reason` is shown to the author, so it says what to do, not what failed. */
  | { ok: false; reason: string };

/** Node types that send control more than one way, so cannot be a list. */
const BRANCHING: ReadonlySet<string> = new Set(['condition', 'switch', 'split']);

const LAYOUT_X = 250;
const LAYOUT_TOP = 50;
const LAYOUT_GAP = 150;

/**
 * The flow as an ordered list, or the reason it cannot be one.
 *
 * A question with choices branches too — each choice has its own outgoing
 * handle — so a question is only listable while it has none.
 */
export function toSteps(nodes: FlowNode[], edges: FlowEdge[]): StepsResult {
  const start = nodes.find((n) => n.type === 'start');
  if (!start) {
    return { ok: false, reason: 'This flow has no Start node, so there is nothing to trigger it.' };
  }

  const steps: FlowStep[] = [];
  const seen = new Set<string>([start.id]);
  let currentId = start.id;

  for (;;) {
    const outgoing = edges.filter((e) => e.source === currentId);
    if (outgoing.length === 0) break;
    if (outgoing.length > 1) {
      return { ok: false, reason: 'This flow branches, so it needs the canvas to show it.' };
    }

    const nextId = outgoing[0]!.target;
    if (seen.has(nextId)) {
      return { ok: false, reason: 'This flow loops back on itself, which the step list cannot show.' };
    }

    const next = nodes.find((n) => n.id === nextId);
    if (!next) {
      return { ok: false, reason: 'A connection in this flow points at a node that is not there.' };
    }
    if (BRANCHING.has(next.type ?? '')) {
      return { ok: false, reason: 'This flow branches, so it needs the canvas to show it.' };
    }
    if (next.type === 'question') {
      const d = next.data as { choices?: unknown[]; buttons?: unknown[] } | null;
      if ((d?.choices?.length ?? 0) > 0 || (d?.buttons?.length ?? 0) > 0) {
        return { ok: false, reason: 'A question here offers choices, and each choice can go its own way — that needs the canvas.' };
      }
    }

    seen.add(nextId);
    steps.push({ id: next.id, type: (next.type ?? 'message') as FlowNodeType, data: next.data });
    currentId = nextId;
  }

  // Nodes the chain never reaches would vanish from a list, and saving from
  // that list would delete them.
  const stranded = nodes.filter((n) => !seen.has(n.id));
  if (stranded.length > 0) {
    return {
      ok: false,
      reason: stranded.length === 1
        ? 'One node is not connected to the rest, so the step list would leave it out.'
        : `${stranded.length} nodes are not connected to the rest, so the step list would leave them out.`,
    };
  }

  return { ok: true, start, steps };
}

/**
 * The list back into nodes and edges, laid out down the canvas.
 *
 * The start node keeps whatever position it had; everything else is placed in
 * order, because a list has no opinion about where things sit and a stale
 * position would put a reordered step in the wrong place on the canvas.
 */
export function fromSteps(start: FlowNode, steps: FlowStep[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [
    { ...start, position: start.position ?? { x: LAYOUT_X, y: LAYOUT_TOP } },
    ...steps.map((s, i) => ({
      id: s.id,
      type: s.type,
      data: s.data,
      position: { x: LAYOUT_X, y: LAYOUT_TOP + (i + 1) * LAYOUT_GAP },
    } as FlowNode)),
  ];

  const chain = [start.id, ...steps.map((s) => s.id)];
  const edges: FlowEdge[] = chain.slice(0, -1).map((source, i) => ({
    id: `e-${source}-${chain[i + 1]}`,
    source,
    target: chain[i + 1]!,
  } as FlowEdge));

  return { nodes, edges };
}

/** A fresh node id, in the shape the canvas toolbar already uses. */
export function newStepId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

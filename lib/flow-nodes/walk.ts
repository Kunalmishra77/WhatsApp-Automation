// lib/flow-nodes/walk.ts
//
// How control moves from one node to the next. Pure, and deliberately so: the
// engine runs it against a live conversation and the editor's simulator runs it
// against a typed one, and a simulator that resolved edges differently from
// production would be worse than no simulator — it would be confidently wrong.

import type { FlowNode, FlowEdge } from '@/modules/flows/types';

/**
 * The node an outcome leads to, or null when the flow ends there.
 *
 * An earlier version ignored `handleId` when none was passed and took the first
 * edge whose source matched, so a node with two outgoing edges followed one of
 * them and the author was never told which.
 *
 * A named handle is matched exactly. An unwired handle falls back to an edge
 * with no handle of its own: an author who drew one line out of a branching node
 * meant that line to be the default, and a flow that stops dead mid-conversation
 * is the worse reading of the same drawing.
 */
export function findNextNode(
  nodes: FlowNode[],
  edges: FlowEdge[],
  currentNodeId: string,
  handleId?: string,
): FlowNode | null {
  const outgoing = edges.filter((e) => e.source === currentNodeId);
  const edge = handleId
    ? outgoing.find((e) => e.sourceHandle === handleId)
      ?? outgoing.find((e) => !e.sourceHandle)
    : outgoing[0];
  if (!edge) return null;
  return nodes.find((n) => n.id === edge.target) ?? null;
}

/**
 * A flow may legitimately loop — a menu the customer returns to — so a walk is
 * bounded by steps rather than by nodes already visited. Past this many in one
 * turn the flow is cycling without waiting for anyone.
 */
export const MAX_STEPS_PER_TURN = 40;

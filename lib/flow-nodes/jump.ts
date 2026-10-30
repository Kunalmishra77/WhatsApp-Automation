import type { NodeHandler } from './types';

// Continues at another step in the same flow.
//
// What it is for: the tail every branch ends with. A flow with four services
// and the same "our team will call you, here is the address" ending had that
// ending drawn four times, and the client edited one copy of it. One shared
// tail with four Jumps into it is the same flow with one place to change.
//
// It stays WITHIN the flow. The engine's `goto` moves the session's current
// node, and a session belongs to one flow — jumping into another would mean a
// session that is half in each, with two triggers and two sets of saved
// answers. A step that reaches another flow is a different feature and should
// be named as one rather than smuggled in here.
//
// Loops are allowed and not guarded here: a menu the customer returns to is a
// legitimate loop, and the engine already stops a turn after MAX_STEPS_PER_TURN
// so a Jump cycle costs one turn rather than the process.

export interface JumpNodeData {
  label?: string;
  /** The id of the step to continue at. */
  targetNodeId?: string;
}

export const jumpHandler: NodeHandler = {
  type: 'jump',

  // No branches: it never follows an edge, which is also why the editor draws
  // it with no outgoing connector.
  handles: () => [],

  async run(ctx) {
    const d = (ctx.node.data ?? {}) as JumpNodeData;
    const target = d.targetNodeId?.trim();

    // Nothing chosen, or chosen and since deleted. Ending the session is the
    // honest outcome — there is no next step — and the editor warns about both
    // cases so this is not where the author finds out.
    if (!target || !ctx.flow.nodes.some((n) => n.id === target)) {
      return { outcome: { next: 'end' } };
    }
    return { outcome: { next: 'goto', nodeId: target } };
  },
};

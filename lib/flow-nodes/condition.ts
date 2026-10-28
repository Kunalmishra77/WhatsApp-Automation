import type { NodeHandler } from './types';
import type { ConditionNodeData } from '@/modules/flows/types';
import { evaluateCondition } from './pure';

// Judges the customer's last message, or a saved number, and takes one of two
// edges. It judges whatever arrived — which is why a condition placed before any
// question tests the keyword that started the flow and always branches the same
// way. The editor warns about that case rather than the node guessing.
export const conditionHandler: NodeHandler = {
  type: 'condition',
  handles: () => ['yes', 'no'],
  async run(ctx) {
    const d = ctx.node.data as ConditionNodeData;
    const handle = evaluateCondition(d, ctx.incoming, ctx.vars) ? 'yes' : 'no';
    return { outcome: { next: 'edge', handle } };
  },
  describe(data) {
    const d = data as ConditionNodeData;
    return { readsVars: d.variable ? [d.variable] : [] };
  },
};

import type { NodeHandler } from './types';
import { placeholdersIn } from './pure';

// Sends a line and moves on in the same turn. This immediacy is correct and is
// also what made the Fitness First flow fire six messages at once: the author
// used message nodes where they meant to ask something. The editor warns about
// that now (lib/flow-validate.ts); the node's behaviour is unchanged.
export const messageHandler: NodeHandler = {
  type: 'message',
  async run(ctx) {
    const d = ctx.node.data as { message?: string };
    if (d.message) await ctx.send.text(ctx.interpolate(d.message));
    return { outcome: { next: 'edge' } };
  },
  describe(data) {
    return { readsVars: placeholdersIn((data as { message?: string }).message) };
  },
};

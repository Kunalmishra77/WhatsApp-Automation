import type { NodeHandler } from './types';
import { placeholdersIn } from './pure';

// Closes the flow. The customer can still message afterwards; the bot answers
// normally once no session is active.
export const endHandler: NodeHandler = {
  type: 'end',
  async run(ctx) {
    const d = ctx.node.data as { message?: string };
    if (d.message) await ctx.send.text(ctx.interpolate(d.message));
    return { outcome: { next: 'end' } };
  },
  describe(data) {
    return { readsVars: placeholdersIn((data as { message?: string }).message) };
  },
};

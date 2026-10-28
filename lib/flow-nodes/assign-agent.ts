import type { NodeHandler } from './types';
import { placeholdersIn } from './pure';

// Says one last thing and hands the conversation to a human. Setting the
// conversation to pending, ending the session and firing the lead export are the
// engine's job, so every node that hands off does all three.
export const assignAgentHandler: NodeHandler = {
  type: 'assign_agent',
  async run(ctx) {
    const d = ctx.node.data as { message?: string };
    if (d.message) await ctx.send.text(ctx.interpolate(d.message));
    return { outcome: { next: 'handoff' } };
  },
  describe(data) {
    return { readsVars: placeholdersIn((data as { message?: string }).message) };
  },
};

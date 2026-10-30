import type { NodeHandler } from './types';

// Lets the flow answer in the bot's own voice and then carry on.
//
// A flow could only recite what its author had typed. If a customer asked
// something mid-booking the engine treated it as an interruption: the AI
// answered outside the flow and the question was re-asked. That works, but it
// cannot be aimed — there was no way to say "here, answer whatever they ask
// about pricing, then continue".
//
// The reply uses the workspace's persona and knowledge base, so it matches
// every other answer the bot gives rather than sounding like a different bot.

export interface AiReplyNodeData {
  label?: string;
  /** Narrows the answer, e.g. "only about our pricing and plans". */
  instruction?: string;
  /** Sent when the model cannot be reached, so the customer is never ignored. */
  fallbackMessage?: string;
}

export const aiReplyHandler: NodeHandler = {
  type: 'ai_reply',
  async run(ctx) {
    const d = ctx.node.data as AiReplyNodeData;

    const answer = await ctx.ai.reply(
      ctx.incoming,
      d.instruction ? ctx.interpolate(d.instruction) : undefined,
    );

    if (answer?.trim()) {
      await ctx.send.text(answer.trim());
    } else {
      // The provider has gone down before and sent every client the same
      // generic line. Saying something specific is better than silence, and
      // better than a stock apology.
      const fallback = d.fallbackMessage?.trim();
      if (fallback) await ctx.send.text(ctx.interpolate(fallback));
    }

    return { outcome: { next: 'edge' } };
  },
};

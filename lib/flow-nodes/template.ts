import type { NodeHandler } from './types';
import { placeholdersIn } from './pure';

// Sends an approved WhatsApp template.
//
// WhatsApp only allows a free-form message within 24 hours of the customer's
// last one. Past that, every other step in this palette is refused — so a Wait
// of two days followed by a message sends nothing at all, and the editor warns
// about exactly that. This is the step that makes a long follow-up possible.
//
// The template's own text lives with Meta and cannot be edited here; what this
// node carries is which template to send and what to put in its blanks.

export interface TemplateNodeData {
  label?: string;
  /** The template's name as Meta knows it. */
  templateName?: string;
  /** Its language code, e.g. 'en'. A template exists per language. */
  language?: string;
  /**
   * Values for {{1}}, {{2}} … in the template body, in order. Each may be a
   * flow placeholder like {{name}}, which is resolved before sending.
   */
  bodyParams?: string[];
}

export const templateHandler: NodeHandler = {
  type: 'template',
  async run(ctx) {
    const d = ctx.node.data as TemplateNodeData;

    // A template node with nothing chosen sends nothing rather than failing the
    // flow; the editor warns about it separately.
    if (d.templateName) {
      await ctx.send.template(
        d.templateName,
        d.language || 'en',
        (d.bodyParams ?? []).map((p) => ctx.interpolate(p)),
      );
    }
    return { outcome: { next: 'edge' } };
  },
  describe(data) {
    const d = data as TemplateNodeData;
    return { readsVars: [...new Set((d.bodyParams ?? []).flatMap((p) => placeholdersIn(p)))] };
  },
};

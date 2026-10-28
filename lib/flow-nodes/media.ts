import type { NodeHandler, MediaKind } from './types';
import { placeholdersIn } from './pure';

// Sends a picture, a file or a map pin. Until now a flow could only send text,
// so a gym could not attach its plan PDF and a clinic could not send directions —
// both had to hand the conversation to a human to send one attachment.
export interface MediaNodeData {
  label?: string;
  kind?: MediaKind | 'location';
  url?: string;
  caption?: string;
  /** Shown as the file name for documents; WhatsApp ignores it otherwise. */
  filename?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  address?: string;
}

export const mediaHandler: NodeHandler = {
  type: 'media',
  async run(ctx) {
    const d = ctx.node.data as MediaNodeData;

    if (d.kind === 'location') {
      if (typeof d.latitude === 'number' && typeof d.longitude === 'number') {
        await ctx.send.location(d.latitude, d.longitude, d.locationName, d.address);
      }
      return { outcome: { next: 'edge' } };
    }

    // A media node with no URL sends nothing rather than failing the flow: a
    // half-configured node should not strand a customer mid-conversation.
    if (d.url) {
      await ctx.send.media(
        d.kind ?? 'image',
        d.url,
        d.caption ? ctx.interpolate(d.caption) : undefined,
        d.filename,
      );
    }
    return { outcome: { next: 'edge' } };
  },
  describe(data) {
    return { readsVars: placeholdersIn((data as MediaNodeData).caption) };
  },
};

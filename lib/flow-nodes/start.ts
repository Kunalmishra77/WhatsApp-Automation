import type { NodeHandler } from './types';

// The start node sends nothing. It exists so a flow has one documented entry
// point and so the trigger has somewhere to live.
export const startHandler: NodeHandler = {
  type: 'start',
  async run() {
    return { outcome: { next: 'edge' } };
  },
};

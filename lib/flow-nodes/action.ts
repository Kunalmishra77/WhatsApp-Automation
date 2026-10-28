import type { NodeHandler, FlowOps } from './types';
import { placeholdersIn } from './pure';

// Everything a flow should do rather than say. Before this node a flow could
// only talk and hand off, so "tag this lead hot and give it to Priya" meant a
// human reading the conversation and doing it by hand.
//
// Several operations share one node because they are almost always wanted
// together, and five separate nodes in a row would be five chances to mis-wire.
export type ActionOp =
  | { type: 'add_tags'; tags: string[] }
  | { type: 'remove_tags'; tags: string[] }
  | { type: 'set_temperature'; temperature: 'hot' | 'warm' | 'cold' }
  | { type: 'set_field'; field: string; value: string }
  | { type: 'assign'; memberId: string }
  | { type: 'create_task'; title: string; dueInHours?: number; assigneeId?: string }
  | { type: 'notify_team'; message: string; channel?: 'whatsapp' | 'email' }
  | { type: 'opt_out' };

export interface ActionNodeData {
  label?: string;
  operations?: ActionOp[];
}

async function runOne(ops: FlowOps, op: ActionOp, interpolate: (s: string) => string): Promise<void> {
  switch (op.type) {
    case 'add_tags':        return ops.addTags(op.tags ?? []);
    case 'remove_tags':     return ops.removeTags(op.tags ?? []);
    case 'set_temperature': return ops.setLeadTemperature(op.temperature);
    case 'set_field':       return ops.setContactField(op.field, interpolate(op.value ?? ''));
    case 'assign':          return ops.assignTo(op.memberId);
    case 'create_task':     return ops.createTask(interpolate(op.title ?? ''), op.dueInHours, op.assigneeId);
    case 'notify_team':     return ops.notifyTeam(interpolate(op.message ?? ''), op.channel ?? 'whatsapp');
    case 'opt_out':         return ops.optOut();
  }
}

export const actionHandler: NodeHandler = {
  type: 'action',
  async run(ctx) {
    const d = ctx.node.data as ActionNodeData;
    for (const op of d.operations ?? []) {
      // Each operation is isolated. A tag that fails to save must not strand the
      // customer on a node that never sends anything, and a half-applied action
      // is better than a conversation that stops.
      try {
        await runOne(ctx.ops, op, (s) => ctx.interpolate(s));
      } catch (err) {
        console.error(`[FlowAction] ${op.type} failed on node ${ctx.node.id}:`, err);
      }
    }
    return { outcome: { next: 'edge' } };
  },
  describe(data) {
    const reads: string[] = [];
    for (const op of (data as ActionNodeData).operations ?? []) {
      if (op.type === 'set_field')   reads.push(...placeholdersIn(op.value));
      if (op.type === 'create_task') reads.push(...placeholdersIn(op.title));
      if (op.type === 'notify_team') reads.push(...placeholdersIn(op.message));
    }
    return { readsVars: [...new Set(reads)] };
  },
};

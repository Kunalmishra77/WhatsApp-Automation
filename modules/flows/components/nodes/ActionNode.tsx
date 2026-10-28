'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Zap } from 'lucide-react';
import type { ActionNodeData, FlowActionOp } from '../../types';

/** A line a client can read without knowing what an operation is called. */
export function describeOp(op: FlowActionOp): string {
  switch (op.type) {
    case 'add_tags':        return `Tag: ${op.tags?.join(', ') || '—'}`;
    case 'remove_tags':     return `Remove tag: ${op.tags?.join(', ') || '—'}`;
    case 'set_temperature': return `Mark ${op.temperature}`;
    case 'set_field':       return `Set ${op.field}`;
    case 'assign':          return 'Assign to a team member';
    case 'create_task':     return `Task: ${op.title || '—'}`;
    case 'notify_team':     return 'Notify the team';
    case 'opt_out':         return 'Stop messaging this contact';
  }
}

export function ActionNode({ data, selected }: NodeProps<ActionNodeData>) {
  const ops = data.operations ?? [];
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-indigo-500' : 'border-indigo-300'}`}>
      <div className="bg-indigo-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Action</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        {ops.length === 0 ? (
          <p className="text-gray-400">Nothing set</p>
        ) : (
          <ul className="space-y-0.5">
            {ops.slice(0, 3).map((op, i) => (
              <li key={i} className="line-clamp-1">• {describeOp(op)}</li>
            ))}
            {ops.length > 3 && <li className="text-gray-400">+{ops.length - 3} more</li>}
          </ul>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-indigo-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-500" />
    </div>
  );
}

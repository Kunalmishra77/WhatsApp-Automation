'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { UserCheck } from 'lucide-react';
import type { AssignAgentNodeData } from '../../types';

export function AssignAgentNode({ data, selected }: NodeProps<AssignAgentNodeData>) {
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-red-500' : 'border-red-300'}`}>
      <div className="bg-red-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <UserCheck className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Handoff to Agent</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.message || 'Connecting to agent...'}</p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-red-500" />
    </div>
  );
}

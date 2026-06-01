'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { MessageSquare } from 'lucide-react';
import type { MessageNodeData } from '../../types';

export function MessageNode({ data, selected }: NodeProps<MessageNodeData>) {
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-blue-500' : 'border-blue-300'}`}>
      <div className="bg-blue-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Message</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.message || 'No message set'}</p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-blue-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
    </div>
  );
}

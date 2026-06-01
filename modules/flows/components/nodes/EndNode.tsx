'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { CheckCircle } from 'lucide-react';
import type { EndNodeData } from '../../types';

export function EndNode({ data, selected }: NodeProps<EndNodeData>) {
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-gray-500' : 'border-gray-300'}`}>
      <div className="bg-gray-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <CheckCircle className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">End</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.message || 'Flow complete'}</p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-gray-500" />
    </div>
  );
}

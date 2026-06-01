'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Play } from 'lucide-react';
import type { StartNodeData } from '../../types';

export function StartNode({ data, selected }: NodeProps<StartNodeData>) {
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-emerald-500' : 'border-emerald-300'}`}>
      <div className="bg-emerald-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <Play className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Start</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="font-medium">Trigger: {data.triggerType === 'keyword' ? 'Keyword' : 'First Message'}</p>
        {data.triggerValue && <p className="mt-0.5 text-gray-400 truncate">&quot;{data.triggerValue}&quot;</p>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500" />
    </div>
  );
}

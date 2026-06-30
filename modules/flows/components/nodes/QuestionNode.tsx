'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { HelpCircle } from 'lucide-react';
import type { QuestionNodeData } from '../../types';

export function QuestionNode({ data, selected }: NodeProps<QuestionNodeData>) {
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-purple-500' : 'border-purple-300'}`}>
      <div className="bg-purple-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <HelpCircle className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Question</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.message || 'No question set'}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="inline-block bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 text-[10px]">Waits for reply</span>
          {data.saveAsVariable && (
            <span className="inline-block bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-[10px]">
              → {data.saveAsVariable}
            </span>
          )}
        </div>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-purple-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500" />
    </div>
  );
}

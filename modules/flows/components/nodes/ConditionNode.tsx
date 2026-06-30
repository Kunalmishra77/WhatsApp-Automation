'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import type { ConditionNodeData } from '../../types';

export function ConditionNode({ data, selected }: NodeProps<ConditionNodeData>) {
  const isVariableCompare = data.conditionType === 'variable_compare';
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-amber-500' : 'border-amber-300'}`}>
      <div className="bg-amber-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Condition</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        {isVariableCompare ? (
          <p className="font-medium text-amber-700">
            {data.variable || '...'} {data.operator ?? '>='} {data.value ?? 0}
          </p>
        ) : (
          <>
            <p>If reply <span className="font-medium">{data.matchType}</span></p>
            <p className="font-medium text-amber-700">&quot;{data.keyword || '...'}&quot;</p>
          </>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-amber-500" />
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: '30%' }} className="!bg-emerald-500" />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: '70%' }} className="!bg-red-400" />
      <div className="flex justify-between px-4 pb-1 text-[10px]">
        <span className="text-emerald-600 font-medium">Yes</span>
        <span className="text-red-400 font-medium">No</span>
      </div>
    </div>
  );
}

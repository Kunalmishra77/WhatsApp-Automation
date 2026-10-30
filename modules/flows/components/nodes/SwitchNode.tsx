'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Shuffle } from 'lucide-react';
import type { SwitchNodeData } from '../../types';

// One row per case with its own connector on the right, the same layout a
// question with choices uses — it is the only arrangement that stays readable
// past three branches, which is the whole reason this node exists.
//
// "Anything else" is drawn as a row like the others rather than as a footnote.
// A many-way branch with no answer for "none of these" is the half of the flow
// people forget, and the canvas should make its absence visible.

export function SwitchNode({ data, selected }: NodeProps<SwitchNodeData>) {
  const cases = (data.cases ?? []).filter((c) => c?.id);
  const subject = data.source === 'variable'
    ? (data.variable ? `{{${data.variable}}}` : 'a saved answer')
    : 'their reply';

  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-56 ${selected ? 'border-orange-500' : 'border-orange-300'}`}>
      <div className="bg-orange-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <Shuffle className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Many ways</span>
      </div>

      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.label || 'Which one?'}</p>
        <p className="mt-0.5 text-[10px] text-gray-500">
          Checks {subject} {data.matchType ?? 'contains'}
        </p>
      </div>

      <div className="border-t border-orange-100">
        {cases.map((c) => (
          <div key={c.id} className="relative border-b border-orange-50 px-3 py-1.5 text-[11px] text-gray-700 last:border-b-0">
            <span className="line-clamp-1 pr-2">{c.label || c.match || c.id}</span>
            <Handle type="source" position={Position.Right} id={`case_${c.id}`} className="!h-2 !w-2 !bg-orange-500" />
          </div>
        ))}
        {cases.length === 0 && (
          <p className="px-3 py-1.5 text-[11px] text-gray-400">No options yet</p>
        )}
        <div className="relative border-t border-orange-100 px-3 py-1.5 text-[11px] text-gray-400">
          <span>Anything else</span>
          <Handle type="source" position={Position.Right} id="default" className="!h-2 !w-2 !bg-gray-400" />
        </div>
      </div>

      <Handle type="target" position={Position.Top} className="!bg-orange-500" />
    </div>
  );
}

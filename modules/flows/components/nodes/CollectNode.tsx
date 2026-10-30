'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ClipboardCheck, Hourglass } from 'lucide-react';
import type { CollectNodeData } from '../../types';

const EXPECTS_LABEL: Record<string, string> = {
  any: 'Any answer', name: 'A name', phone: 'A mobile number',
  email: 'An email', number: 'A number', date: 'A date', time: 'A time',
};

// A question that checks the answer. The extra lines out of it are the two
// things that can go wrong: the customer never gets it right, or never replies.
export function CollectNode({ data, selected }: NodeProps<CollectNodeData>) {
  const hasTimeout = typeof data.timeoutHours === 'number' && data.timeoutHours > 0;
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-56 ${selected ? 'border-sky-500' : 'border-sky-300'}`}>
      <div className="bg-sky-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <ClipboardCheck className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Ask &amp; check</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.message || 'No question written yet'}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">
            {EXPECTS_LABEL[data.expects ?? 'any']}
          </span>
          {data.saveAsVariable && (
            <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
              → {data.saveAsVariable}
            </span>
          )}
        </div>
      </div>
      <div className="relative border-t border-sky-100 px-3 py-1.5 text-[11px] text-gray-400">
        <span>Gives up after {data.maxAttempts ?? 2} tries</span>
        <Handle type="source" position={Position.Right} id="gave_up" className="!h-2 !w-2 !bg-red-400" />
      </div>
      {hasTimeout && (
        <div className="relative flex items-center gap-1 border-t border-sky-100 px-3 py-1.5 text-[11px] text-gray-400">
          <Hourglass className="h-3 w-3" />
          <span>No reply in {data.timeoutHours}h</span>
          <Handle type="source" position={Position.Left} id="timeout" className="!h-2 !w-2 !bg-amber-400" />
        </div>
      )}
      <Handle type="target" position={Position.Top} className="!bg-sky-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-sky-500" />
    </div>
  );
}

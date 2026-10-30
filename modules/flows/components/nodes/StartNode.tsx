'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Play, Clock } from 'lucide-react';
import type { StartNodeData } from '../../types';
import { describeTriggerType } from '@/lib/flow-triggers';

// The one node whose whole content is a sentence. It used to read "Trigger:
// Keyword" with the keyword underneath, which meant nothing to the person who
// typed it — and with seven trigger types rather than two, a type name is even
// less use than it was.
//
// `describeTriggerType` is the same sentence the config panel and the flow
// summary show, so the canvas cannot disagree with either about what will start
// this flow.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function StartNode({ data, selected }: NodeProps<StartNodeData>) {
  const window = data.activeWindow;
  const hasHours = !!window?.from && !!window?.to;
  const days = Array.isArray(window?.days) && window!.days!.length > 0 && window!.days!.length < 7
    ? window!.days!.map((i) => DAYS[i] ?? '').filter(Boolean).join(' ')
    : null;
  const priority = data.priority ?? 0;

  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-emerald-500' : 'border-emerald-300'}`}>
      <div className="bg-emerald-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <Play className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Start</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="leading-snug">{describeTriggerType(data.triggerType, data.triggerValue)}</p>

        {hasHours && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-teal-700">
            <Clock className="h-2.5 w-2.5 shrink-0" />
            {window!.from}–{window!.to}{days ? ` · ${days}` : ''}
          </p>
        )}

        {/* Only when it is not the default. A badge on every node would say
            nothing; one on the two flows an author has reordered says a lot. */}
        {priority !== 0 && (
          <p className="mt-1 text-[10px] text-amber-700">
            {priority > 0 ? 'Runs before other matching flows' : 'Runs after other matching flows'}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500" />
    </div>
  );
}

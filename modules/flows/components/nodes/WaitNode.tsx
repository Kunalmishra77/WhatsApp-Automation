'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Clock } from 'lucide-react';
import type { WaitNodeData } from '../../types';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** What the node shows on the canvas, so the pause is readable without opening it. */
export function waitSummary(d: WaitNodeData): string {
  if (d.mode === 'time' && d.atTime) {
    const day = typeof d.weekday === 'number' ? WEEKDAYS[d.weekday] : null;
    return day ? `Next ${day}, ${d.atTime}` : `Daily at ${d.atTime}`;
  }
  const parts: string[] = [];
  if (d.days)    parts.push(`${d.days} day${d.days === 1 ? '' : 's'}`);
  if (d.hours)   parts.push(`${d.hours} hour${d.hours === 1 ? '' : 's'}`);
  if (d.minutes) parts.push(`${d.minutes} min`);
  return parts.length > 0 ? `Wait ${parts.join(' ')}` : 'No delay set';
}

export function WaitNode({ data, selected }: NodeProps<WaitNodeData>) {
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-teal-500' : 'border-teal-300'}`}>
      <div className="bg-teal-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Wait</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{waitSummary(data)}</p>
        <span className="mt-1 inline-block bg-teal-100 text-teal-700 rounded px-1.5 py-0.5 text-[10px]">
          Bot keeps replying meanwhile
        </span>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-teal-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-teal-500" />
    </div>
  );
}

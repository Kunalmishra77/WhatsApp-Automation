'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { SplitSquareHorizontal } from 'lucide-react';
import type { SplitNodeData } from '../../types';

// Shows each arm with the share it actually receives, as a percentage of the
// weights rather than the weights themselves. An author who typed 3 and 1 means
// "three times as many", and 75% / 25% is that sentence in the form they will
// read the result in.
//
// A retired arm (weight 0) is drawn greyed with its connector kept, because
// that is the point of weighting it 0 instead of deleting it: sessions parked
// inside the losing arm still have somewhere to go.

export function SplitNode({ data, selected }: NodeProps<SplitNodeData>) {
  const variants = (data.variants ?? []).filter((v) => v?.id);
  const total = variants.reduce((sum, v) => sum + Math.max(0, v.weight ?? 1), 0);

  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-56 ${selected ? 'border-pink-500' : 'border-pink-300'}`}>
      <div className="bg-pink-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <SplitSquareHorizontal className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Split test</span>
      </div>

      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.label || 'A/B test'}</p>
        <p className="mt-0.5 text-[10px] text-gray-500">
          Each person always gets the same arm
        </p>
      </div>

      <div className="border-t border-pink-100">
        {variants.map((v) => {
          const weight = Math.max(0, v.weight ?? 1);
          const share = total > 0 ? Math.round((weight / total) * 100) : 0;
          const retired = weight === 0;
          return (
            <div
              key={v.id}
              className={`relative border-b border-pink-50 px-3 py-1.5 text-[11px] last:border-b-0 ${retired ? 'text-gray-400' : 'text-gray-700'}`}
            >
              <span className="line-clamp-1 pr-8">{v.label || v.id}</span>
              <span className="absolute right-4 top-1.5 text-[10px] tabular-nums">
                {retired ? 'off' : `${share}%`}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={`variant_${v.id}`}
                className={`!h-2 !w-2 ${retired ? '!bg-gray-300' : '!bg-pink-500'}`}
              />
            </div>
          );
        })}
        {variants.length === 0 && (
          <p className="px-3 py-1.5 text-[11px] text-gray-400">No arms yet — this step is skipped</p>
        )}
      </div>

      <Handle type="target" position={Position.Top} className="!bg-pink-500" />
      {/* The plain way out, taken when every arm is retired or none exists. */}
      {total === 0 && <Handle type="source" position={Position.Bottom} className="!bg-pink-500" />}
    </div>
  );
}

'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { FileCheck } from 'lucide-react';
import type { TemplateNodeData } from '../../types';

// The only step that can reach someone more than 24 hours after their last
// message. Its wording lives with Meta, so the canvas can show the name and the
// blanks but never the text.
export function TemplateNode({ data, selected }: NodeProps<TemplateNodeData>) {
  const params = data.bodyParams ?? [];
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-violet-500' : 'border-violet-300'}`}>
      <div className="bg-violet-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <FileCheck className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Template</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2 break-all font-medium">{data.templateName || 'No template chosen'}</p>
        {params.length > 0 && (
          <p className="mt-1 line-clamp-2 text-[10px] text-gray-500">{params.join(' · ')}</p>
        )}
        <span className="mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
          Works after 24 hours
        </span>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-violet-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-violet-500" />
    </div>
  );
}

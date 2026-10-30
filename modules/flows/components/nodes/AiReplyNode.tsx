'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Sparkles } from 'lucide-react';
import type { AiReplyNodeData } from '../../types';

// Answers in the bot's own voice, using this workspace's persona and knowledge
// base, then carries on with the flow.
export function AiReplyNode({ data, selected }: NodeProps<AiReplyNodeData>) {
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-fuchsia-500' : 'border-fuchsia-300'}`}>
      <div className="bg-fuchsia-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">AI Reply</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.instruction || 'Answers whatever they asked'}</p>
        <span className="mt-1 inline-block rounded bg-fuchsia-100 px-1.5 py-0.5 text-[10px] text-fuchsia-700">
          Uses your knowledge base
        </span>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-fuchsia-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-fuchsia-500" />
    </div>
  );
}

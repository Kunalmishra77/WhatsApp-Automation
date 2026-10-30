'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Webhook as WebhookIcon } from 'lucide-react';
import type { WebhookNodeData } from '../../types';

// Reaches something this platform has never heard of. Two lines out, because an
// outside system is the one part of a flow nobody here controls.
export function WebhookNode({ data, selected }: NodeProps<WebhookNodeData>) {
  const fields = data.body?.length ?? 0;
  const reads = data.saveFrom?.length ?? 0;
  let host = '';
  try { host = data.url ? new URL(data.url).host : ''; } catch { host = data.url ?? ''; }

  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-56 ${selected ? 'border-slate-600' : 'border-slate-300'}`}>
      <div className="bg-slate-600 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <WebhookIcon className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Send to a system</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-1 break-all font-medium">{host || 'No address set'}</p>
        <p className="mt-0.5 text-[10px] text-gray-500">
          {fields} field{fields === 1 ? '' : 's'} sent{reads > 0 ? ` · ${reads} read back` : ''}
        </p>
      </div>
      <div className="relative border-t border-slate-100 px-3 py-1.5 text-[11px] text-gray-400">
        <span>If it fails</span>
        <Handle type="source" position={Position.Right} id="failed" className="!h-2 !w-2 !bg-red-400" />
      </div>
      <Handle type="target" position={Position.Top} className="!bg-slate-600" />
      <Handle type="source" position={Position.Bottom} id="ok" className="!bg-slate-600" />
    </div>
  );
}

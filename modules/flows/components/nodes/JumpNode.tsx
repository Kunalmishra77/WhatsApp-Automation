'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { CornerDownRight } from 'lucide-react';
import type { JumpNodeData } from '../../types';

// Deliberately has no outgoing connector. A Jump does not follow an edge — it
// moves control to the step it names — and drawing a connector nobody can use
// would invite the author to wire a line that is silently ignored.
//
// The step it leads to is shown by its id rather than its label, because the
// config panel is where the choice is made and a label can be blank. An unset
// or deleted target is called out on the node itself: the editor's validation
// says so too, but this is the node that looks like it continues somewhere.

export function JumpNode({ data, selected }: NodeProps<JumpNodeData>) {
  const target = data.targetNodeId?.trim();

  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-lime-600' : 'border-lime-300'}`}>
      <div className="bg-lime-600 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <CornerDownRight className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Go to step</span>
      </div>
      <div className="px-3 py-2 text-xs">
        {target ? (
          <p className="line-clamp-1 break-all font-medium text-lime-700">{target}</p>
        ) : (
          <p className="text-amber-600">No step chosen — the flow ends here</p>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-lime-600" />
    </div>
  );
}

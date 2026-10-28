'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { HelpCircle, Hourglass } from 'lucide-react';
import type { QuestionNodeData } from '../../types';

// A question with choices gets one outgoing handle per choice, so the author
// wires each answer to its own branch instead of matching the reply text with a
// condition afterwards. Each choice is a row with its own connector on the right,
// which is the only layout that stays readable past two or three options.
//
// `other` is where a typed reply goes when it matches no choice. `timeout` is
// where silence goes once timeoutHours elapses — a branch that did nothing at
// all until the engine started reading that field.

const MODE_LABEL = {
  text: 'Types a reply',
  buttons: 'Taps a button',
  list: 'Picks from a menu',
} as const;

function choices(data: QuestionNodeData) {
  if (data.choices && data.choices.length > 0) return data.choices;
  if (data.buttons && data.buttons.length > 0) {
    return data.buttons.map((title) => ({ id: title, title, description: undefined }));
  }
  return [];
}

export function QuestionNode({ data, selected }: NodeProps<QuestionNodeData>) {
  const opts = choices(data);
  const mode = data.answerMode ?? (opts.length > 0 ? 'buttons' : 'text');
  const hasTimeout = typeof data.timeoutHours === 'number' && data.timeoutHours > 0;

  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-56 ${selected ? 'border-purple-500' : 'border-purple-300'}`}>
      <div className="bg-purple-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <HelpCircle className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Question</span>
      </div>

      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.message || 'No question set'}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="inline-block bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 text-[10px]">
            {MODE_LABEL[mode]}
          </span>
          {data.saveAsVariable && (
            <span className="inline-block bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-[10px]">
              → {data.saveAsVariable}
            </span>
          )}
        </div>
      </div>

      {opts.length > 0 && (
        <div className="border-t border-purple-100">
          {opts.map((c) => (
            <div key={c.id} className="relative px-3 py-1.5 text-[11px] text-gray-700 border-b border-purple-50 last:border-b-0">
              <span className="line-clamp-1 pr-2">{c.title || c.id}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={`choice_${c.id}`}
                className="!bg-purple-500 !w-2 !h-2"
              />
            </div>
          ))}
          <div className="relative px-3 py-1.5 text-[11px] text-gray-400 border-t border-purple-100">
            <span>Anything else</span>
            <Handle type="source" position={Position.Right} id="other" className="!bg-gray-400 !w-2 !h-2" />
          </div>
        </div>
      )}

      {hasTimeout && (
        <div className="relative flex items-center gap-1 border-t border-purple-100 px-3 py-1.5 text-[11px] text-gray-400">
          <Hourglass className="h-3 w-3" />
          <span>No reply in {data.timeoutHours}h</span>
          <Handle type="source" position={Position.Left} id="timeout" className="!bg-amber-400 !w-2 !h-2" />
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!bg-purple-500" />
      {/* A question with no choices has one way forward, as it always did. */}
      {opts.length === 0 && (
        <Handle type="source" position={Position.Bottom} className="!bg-purple-500" />
      )}
    </div>
  );
}

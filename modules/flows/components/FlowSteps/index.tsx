'use client';
import { useMemo } from 'react';
import {
  MessageSquare, HelpCircle, Clock, Image as ImageIcon, Zap, UserCheck, CheckCircle,
  ChevronUp, ChevronDown, Trash2, Plus, Play, LayoutGrid, FileCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toSteps, fromSteps, newStepId, type FlowStep } from '@/lib/flow-steps';
import type { FlowNode, FlowEdge, FlowNodeType } from '../../types';

// A flow as a list of steps.
//
// Of the eighteen flows the twelve workspaces have built, eleven are a straight
// line and eight of those are two to four nodes — a single auto-reply, written
// on a node canvas because that was the only thing on offer. This is for them.
//
// Anything that branches still needs the canvas, and says so instead of being
// flattened: a step list that quietly dropped a branch would lose a client's
// work.

interface FlowStepsProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onChange: (nodes: FlowNode[], edges: FlowEdge[]) => void;
  onEditStep: (nodeId: string) => void;
  onSwitchToCanvas: () => void;
  selectedNodeId: string | null;
}

const STEP_KINDS: Array<{ type: FlowNodeType; label: string; icon: React.ReactNode; defaultData: Record<string, unknown> }> = [
  { type: 'message', label: 'Send a message', icon: <MessageSquare className="h-4 w-4" />, defaultData: { label: 'Message', message: '' } },
  { type: 'question', label: 'Ask a question', icon: <HelpCircle className="h-4 w-4" />, defaultData: { label: 'Question', message: '', timeoutHours: 24 } },
  { type: 'media', label: 'Send an image or file', icon: <ImageIcon className="h-4 w-4" />, defaultData: { label: 'Send Image', kind: 'image', url: '' } },
  { type: 'wait', label: 'Wait', icon: <Clock className="h-4 w-4" />, defaultData: { label: 'Wait', mode: 'duration', hours: 2 } },
  { type: 'template', label: 'Send a template (works after 24h)', icon: <FileCheck className="h-4 w-4" />, defaultData: { label: 'Template', templateName: '', language: 'en', bodyParams: [] } },
  { type: 'action', label: 'Do something', icon: <Zap className="h-4 w-4" />, defaultData: { label: 'Action', operations: [] } },
  { type: 'assign_agent', label: 'Hand over to a person', icon: <UserCheck className="h-4 w-4" />, defaultData: { label: 'Handoff to Agent', message: 'Connecting you to an agent...' } },
  { type: 'end', label: 'End the flow', icon: <CheckCircle className="h-4 w-4" />, defaultData: { label: 'End', message: 'Thank you! Have a great day.' } },
];

const ICON_FOR: Record<string, React.ReactNode> = Object.fromEntries(
  STEP_KINDS.map((k) => [k.type, k.icon]),
);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** One line describing what this step does, in the author's own words where possible. */
function summarise(step: FlowStep): string {
  const d = (step.data ?? {}) as Record<string, unknown>;
  const text = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');

  switch (step.type) {
    case 'message':
    case 'assign_agent':
    case 'end':
      return text('message') || 'Nothing written yet';
    case 'question':
      return text('message') || 'No question written yet';
    case 'media':
      return d.kind === 'location'
        ? (text('locationName') || 'A location pin')
        : `${String(d.kind ?? 'image')}${text('caption') ? ` — ${text('caption')}` : ''}`;
    case 'wait': {
      if (d.mode === 'time' && text('atTime')) {
        const day = typeof d.weekday === 'number' ? WEEKDAYS[d.weekday as number] : null;
        return day ? `Until next ${day}, ${text('atTime')}` : `Until ${text('atTime')} each day`;
      }
      const parts: string[] = [];
      for (const [k, unit] of [['days', 'day'], ['hours', 'hour'], ['minutes', 'min']] as const) {
        const v = d[k];
        if (typeof v === 'number' && v > 0) parts.push(`${v} ${unit}${unit !== 'min' && v !== 1 ? 's' : ''}`);
      }
      return parts.length ? parts.join(' ') : 'No delay set';
    }
    case 'template':
      return text('templateName') || 'No template chosen yet';
    case 'action': {
      const ops = (d.operations as unknown[] | undefined) ?? [];
      return ops.length ? `${ops.length} action${ops.length === 1 ? '' : 's'}` : 'Nothing set';
    }
    default:
      return '';
  }
}

function triggerLine(start: FlowNode): string {
  const d = (start.data ?? {}) as unknown as Record<string, unknown>;
  if (d.triggerType === 'first_message') return 'When someone messages for the first time';
  const value = typeof d.triggerValue === 'string' ? d.triggerValue : '';
  return value ? `When someone says “${value}”` : 'No trigger set yet — this flow will never start';
}

export function FlowSteps({
  nodes, edges, onChange, onEditStep, onSwitchToCanvas, selectedNodeId,
}: FlowStepsProps) {
  const result = useMemo(() => toSteps(nodes, edges), [nodes, edges]);

  if (!result.ok) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm space-y-3 text-center">
          <LayoutGrid className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">This flow needs the canvas</p>
          <p className="text-xs leading-snug text-muted-foreground">{result.reason}</p>
          <Button size="sm" variant="outline" onClick={onSwitchToCanvas}>Open the canvas</Button>
        </div>
      </div>
    );
  }

  const { start, steps } = result;

  const commit = (next: FlowStep[]) => {
    const rebuilt = fromSteps(start, next);
    onChange(rebuilt.nodes, rebuilt.edges);
  };

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target]!, next[index]!];
    commit(next);
  };

  const remove = (index: number) => commit(steps.filter((_, i) => i !== index));

  const add = (kind: (typeof STEP_KINDS)[number]) => {
    commit([...steps, { id: newStepId(kind.type), type: kind.type, data: { ...kind.defaultData } }]);
  };

  return (
    <div className="h-full overflow-y-auto bg-muted/20 p-4">
      <div className="mx-auto max-w-2xl space-y-2">
        {/* The trigger reads as the first line of the sentence the list makes. */}
        <button
          type="button"
          onClick={() => onEditStep(start.id)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-400',
            selectedNodeId === start.id ? 'border-brand-500' : 'border-border',
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Play className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Starts</span>
            <span className="block truncate text-sm">{triggerLine(start)}</span>
          </span>
        </button>

        {steps.map((step, i) => (
          <div key={step.id} className="flex items-start gap-1.5">
            <button
              type="button"
              onClick={() => onEditStep(step.id)}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-400',
                selectedNodeId === step.id ? 'border-brand-500' : 'border-border',
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                {ICON_FOR[step.type] ?? <MessageSquare className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                  {STEP_KINDS.find((k) => k.type === step.type)?.label ?? step.type}
                </span>
                <span className="block truncate text-sm">{summarise(step)}</span>
              </span>
            </button>

            <div className="flex flex-col gap-0.5 pt-1">
              <Button variant="ghost" size="icon" className="h-5 w-6" disabled={i === 0}
                onClick={() => move(i, -1)} aria-label="Move up">
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-6" disabled={i === steps.length - 1}
                onClick={() => move(i, 1)} aria-label="Move down">
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="mt-1 h-5 w-6 text-muted-foreground"
              onClick={() => remove(i)} aria-label="Remove step">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}

        {steps.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nothing happens yet. Add the first step below.
          </p>
        )}

        <div className="pt-2">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Plus className="h-3 w-3" /> Add a step
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STEP_KINDS.map((kind) => (
              <Button key={kind.type} variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                onClick={() => add(kind)}>
                {kind.icon}
                {kind.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

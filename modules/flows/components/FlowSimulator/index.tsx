'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, RotateCcw, X, Clock, Zap, UserCheck, CheckCircle, Info, Image as ImageIcon, MapPin, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { simulateFlow, type SimTurn, type SimEvent } from '@/lib/flow-simulator';
import type { FlowNode, FlowEdge } from '../../types';

// Try a flow without a phone.
//
// Until this existed the only way to test one was to message a client's live
// number, and the only way to find a mistake was a customer hitting it. The
// Fitness First welcome flow sent six messages at once on its trigger keyword
// and nobody knew until a real lead did.
//
// It runs the same node handlers and the same edge resolution as production,
// so what it shows is what WhatsApp would do — with the exceptions listed at
// the foot of the panel, stated rather than glossed over.

interface FlowSimulatorProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onClose: () => void;
  /** Lets the canvas highlight whichever node the transcript last touched. */
  onVisit?: (nodeId: string | null) => void;
}

const EVENT_ICON: Partial<Record<SimEvent['kind'], React.ReactNode>> = {
  wait:     <Clock className="h-3 w-3" />,
  action:   <Zap className="h-3 w-3" />,
  handoff:  <UserCheck className="h-3 w-3" />,
  end:      <CheckCircle className="h-3 w-3" />,
  note:     <Info className="h-3 w-3" />,
  template: <FileCheck className="h-3 w-3" />,
  media:    <ImageIcon className="h-3 w-3" />,
  location: <MapPin className="h-3 w-3" />,
};

function labelFor(nodes: FlowNode[], id: string): string {
  const n = nodes.find((x) => x.id === id);
  return (n?.data as { label?: string } | undefined)?.label ?? n?.type ?? '';
}

/** A bubble for something the bot said; a line for everything else. */
function EventRow({ event, nodes }: { event: SimEvent; nodes: FlowNode[] }) {
  const nodeLabel = event.nodeId ? labelFor(nodes, event.nodeId) : '';

  if (event.kind === 'text' || event.kind === 'buttons' || event.kind === 'list') {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-black/5 dark:bg-zinc-800 dark:ring-white/10">
          <p className="whitespace-pre-wrap break-words">{event.body}</p>
          {event.kind === 'buttons' && (
            <div className="mt-2 space-y-1 border-t border-border pt-2">
              {event.buttons.map((b, i) => (
                <div key={i} className="rounded border border-border px-2 py-1 text-center text-xs text-brand-600">{b}</div>
              ))}
            </div>
          )}
          {event.kind === 'list' && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="rounded border border-border px-2 py-1 text-center text-xs text-brand-600">{event.buttonText}</div>
              <ul className="mt-1 space-y-0.5">
                {event.sections.flatMap((s) => s.rows).map((r) => (
                  <li key={r.id} className="text-[11px] text-muted-foreground">• {r.title}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {nodeLabel && <span className="pl-1 text-[10px] text-muted-foreground">{nodeLabel}</span>}
      </div>
    );
  }

  const text =
    event.kind === 'media'    ? `Sends ${event.mediaKind}${event.caption ? ` — "${event.caption}"` : ''}`
    : event.kind === 'location' ? `Sends a location pin${event.name ? ` — ${event.name}` : ''}`
    : event.kind === 'action'   ? event.description
    : event.kind === 'template' ? `Sends the “${event.name}” template${event.params.length ? ` — ${event.params.join(', ')}` : ''}`
    : event.kind === 'wait'     ? `Waits until ${event.until}`
    : event.kind === 'handoff'  ? 'Hands over to a person'
    : event.kind === 'end'      ? 'Flow ends here'
    : event.text;

  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground">
      {EVENT_ICON[event.kind] ?? null}
      <span>{text}</span>
      {nodeLabel && <span className="opacity-60">· {nodeLabel}</span>}
    </div>
  );
}

export function FlowSimulator({ nodes, edges, onClose, onVisit }: FlowSimulatorProps) {
  const [replies, setReplies] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<SimTurn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The whole conversation is re-run from the start on every change, so the
  // transcript always reflects the flow as it is saved right now — edit a node
  // and the same replies replay against the new version.
  useEffect(() => {
    let cancelled = false;
    void simulateFlow(nodes, edges, replies).then((t) => {
      if (!cancelled) setTurns(t);
    });
    return () => { cancelled = true; };
  }, [nodes, edges, replies]);

  const last = turns[turns.length - 1];
  const waiting = last?.waitingAt ?? null;
  const finished = last?.finished ?? false;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    onVisit?.(waiting ?? last?.visited[last.visited.length - 1] ?? null);
  }, [turns]);

  const variables = useMemo(() => {
    const vars = last?.vars ?? {};
    // `system.` values are seeded, and the numeric twin of every answer is an
    // implementation detail — the author cares about what they asked for.
    return Object.entries(vars)
      .filter(([k]) => k.endsWith('_text') && !k.startsWith('system.'))
      .map(([k, v]) => [k.slice(0, -'_text'.length), String(v)] as const);
  }, [turns]);

  const send = () => {
    const value = input.trim();
    if (!value || finished) return;
    setReplies((r) => [...r, value]);
    setInput('');
  };

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
        <div>
          <p className="text-sm font-medium">Try this flow</p>
          <p className="text-[11px] text-muted-foreground">Nothing is sent to WhatsApp</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            title="Start again"
            onClick={() => { setReplies([]); setInput(''); }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {turns.map((turn, i) => (
          <div key={i} className="space-y-1.5">
            {turn.reply !== null && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-brand-500 px-3 py-2 text-sm text-white shadow-sm">
                  {turn.reply}
                </div>
              </div>
            )}
            {turn.events.map((e, j) => <EventRow key={j} event={e} nodes={nodes} />)}
          </div>
        ))}

        {turns.length === 0 && (
          <p className="pt-6 text-center text-xs text-muted-foreground">
            This flow has nothing to send yet.
          </p>
        )}
      </div>

      {variables.length > 0 && (
        <div className="border-t border-border bg-card px-3 py-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Answers saved</p>
          <div className="flex flex-wrap gap-1">
            {variables.map(([name, value]) => (
              <span key={name} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                <span className="text-muted-foreground">{name}:</span> {value}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border bg-card p-2">
        <div className="flex items-center gap-1.5">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder={
              finished ? 'The flow has ended' : waiting ? 'Type a reply…' : 'Type the trigger or a reply…'
            }
            disabled={finished}
            className="h-8 text-sm"
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={send} disabled={finished || !input.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Runs the real flow engine. It does not call the AI, so a reply always
          counts as an answer; a wait is shown and skipped rather than waited out.
        </p>
      </div>
    </div>
  );
}

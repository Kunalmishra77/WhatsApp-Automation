// lib/flow-simulator.ts
//
// Runs a flow against typed replies instead of a real conversation.
//
// Until now the only way to test a flow was to message a client's live number
// from a phone, and the only way to find a mistake was a customer hitting it.
// The Fitness First welcome flow fired six messages at once on the trigger
// keyword and nobody knew until a lead did.
//
// It runs the real handlers from lib/flow-nodes and the real edge resolution
// from lib/flow-nodes/walk, with send and ops replaced by recorders. Those
// handlers import nothing server-side, so this runs in the browser as happily
// as on the server — which is the point: a simulator that disagreed with
// production would be worse than none, because people would trust it.
//
// What it does not reproduce, and says so rather than pretending:
//   * AI — the off-topic classifier and multi-field extraction are skipped, so
//     a reply is always treated as an answer to the question asked;
//   * waiting — a Wait node reports its delay and continues immediately;
//   * the 24-hour window, template approval, and whether a number can be
//     messaged at all.

import type { FlowNode, FlowEdge } from '@/modules/flows/types';
import { handlerFor } from './flow-nodes';
import { findNextNode, MAX_STEPS_PER_TURN } from './flow-nodes/walk';
import { interpolateTemplate, parseNumberFromReply } from './flow-nodes/pure';
import { computeWakeAt, type WaitNodeData } from './flow-nodes/wait';
import type { FlowContext, FlowOps, SendFacade, ListSection, MediaKind } from './flow-nodes/types';

export type SimEvent =
  | { kind: 'text'; nodeId: string; body: string }
  | { kind: 'buttons'; nodeId: string; body: string; buttons: string[] }
  | { kind: 'list'; nodeId: string; body: string; buttonText: string; sections: ListSection[] }
  | { kind: 'media'; nodeId: string; mediaKind: MediaKind; url: string; caption?: string }
  | { kind: 'location'; nodeId: string; name?: string }
  | { kind: 'action'; nodeId: string; description: string }
  | { kind: 'wait'; nodeId: string; until: string }
  | { kind: 'handoff'; nodeId: string }
  | { kind: 'end'; nodeId: string }
  | { kind: 'note'; nodeId: string; text: string };

export interface SimTurn {
  /** What the customer said. Null for the turn that starts the flow. */
  reply: string | null;
  /** Nodes executed this turn, in order. */
  visited: string[];
  events: SimEvent[];
  /** Variables after this turn. */
  vars: FlowContext;
  /** Set when the flow is waiting for the next reply. */
  waitingAt: string | null;
  /** Set once the flow has finished and further replies do nothing. */
  finished: boolean;
}

export interface SimOptions {
  /** Seeds `system.*` so copy that reads them renders as it would live. */
  contactName?: string;
  workspaceName?: string;
  phone?: string;
}

function describeAction(op: Record<string, unknown>): string {
  const type = String(op.type ?? '');
  switch (type) {
    case 'add_tags':        return `Tag added: ${(op.tags as string[] ?? []).join(', ') || '—'}`;
    case 'remove_tags':     return `Tag removed: ${(op.tags as string[] ?? []).join(', ') || '—'}`;
    case 'set_temperature': return `Lead marked ${String(op.temperature ?? '')}`;
    case 'set_field':       return `Contact ${String(op.field ?? '')} set`;
    case 'assign':          return 'Assigned to a team member';
    case 'create_task':     return `Task created: ${String(op.title ?? '—')}`;
    case 'notify_team':     return 'Team notified';
    case 'opt_out':         return 'Contact opted out';
    default:                return type || 'Action';
  }
}

/**
 * One simulated conversation.
 *
 * `replies` are what the customer types, in order. The flow starts first; each
 * reply then drives one more turn. Extra replies after the flow finishes are
 * reported as finished turns rather than silently ignored, because "my flow
 * stopped answering" is the thing people come here to understand.
 */
export async function simulateFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  replies: string[],
  options: SimOptions = {},
): Promise<SimTurn[]> {
  const start = nodes.find((n) => n.type === 'start');
  if (!start) {
    return [{
      reply: null, visited: [], vars: {}, waitingAt: null, finished: true,
      events: [{ kind: 'note', nodeId: '', text: 'This flow has no Start node, so nothing can trigger it.' }],
    }];
  }

  const now = new Date();
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...o }).format(now);

  let vars: FlowContext = {
    'system.date': fmt({ day: '2-digit', month: 'short', year: 'numeric' }),
    'system.time': fmt({ hour: '2-digit', minute: '2-digit', hour12: true }),
    'system.weekday': fmt({ weekday: 'long' }),
    'system.contact_name': options.contactName ?? 'Test Customer',
    'system.workspace_name': options.workspaceName ?? 'Your business',
    'system.phone': options.phone ?? '91XXXXXXXXXX',
  };

  const turns: SimTurn[] = [];
  let current: FlowNode | null = start;
  let resuming = false;
  let finished = false;

  // The turn index drives which reply is being answered; -1 is the trigger.
  for (let t = -1; t < replies.length; t++) {
    const reply = t < 0 ? null : (replies[t] ?? '');

    if (finished) {
      turns.push({
        reply, visited: [], vars: { ...vars }, waitingAt: null, finished: true,
        events: [{ kind: 'note', nodeId: '', text: 'The flow has ended — the bot answers normally from here.' }],
      });
      continue;
    }

    const visited: string[] = [];
    const events: SimEvent[] = [];
    let waitingAt: string | null = null;

    // Saving the reply into the parked node's variable is the engine's job, so
    // it is done here too rather than inside a handler.
    if (resuming && current) {
      const d = current.data as { saveAsVariable?: string } | null;
      const saveAs = d?.saveAsVariable;
      if (saveAs && reply !== null) {
        vars = { ...vars, [saveAs]: parseNumberFromReply(reply), [`${saveAs}_text`]: reply.trim() };
      }
    }

    const send: SendFacade = {
      async text(body) { events.push({ kind: 'text', nodeId: current!.id, body }); },
      async buttons(body, buttons) { events.push({ kind: 'buttons', nodeId: current!.id, body, buttons }); },
      async media(mediaKind, url, caption) { events.push({ kind: 'media', nodeId: current!.id, mediaKind, url, caption }); },
      async location(_lat, _lng, name) { events.push({ kind: 'location', nodeId: current!.id, name }); },
      async list(body, buttonText, sections) { events.push({ kind: 'list', nodeId: current!.id, body, buttonText, sections }); },
    };

    const noop = async () => {};
    const ops: FlowOps = {
      setConversationStatus: noop,
      addTags: noop, removeTags: noop, setLeadTemperature: noop,
      setContactField: noop, assignTo: noop, createTask: noop,
      notifyTeam: noop, optOut: noop,
      schedule: async () => {}, cancelSchedules: noop,
    };

    for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
      if (!current) { finished = true; break; }

      const handler = handlerFor(current.type);
      if (!handler) {
        events.push({ kind: 'note', nodeId: current.id, text: `This build cannot run a "${current.type}" node.` });
        finished = true;
        break;
      }

      visited.push(current.id);

      // An Action node's effects are described rather than performed, so the
      // transcript shows what would happen without touching any data.
      if (current.type === 'action') {
        const d = current.data as { operations?: Array<Record<string, unknown>> } | null;
        for (const op of d?.operations ?? []) {
          events.push({ kind: 'action', nodeId: current.id, description: describeAction(op) });
        }
      }

      const ctx = {
        node: current,
        flow: { nodes, edges },
        incoming: reply ?? '',
        choice: undefined,
        vars,
        send,
        ops,
        workspaceId: 'sim', conversationId: 'sim', sessionId: 'sim',
        contactId: null, contactPhone: options.phone ?? '91XXXXXXXXXX',
        interpolate: (text: string) => interpolateTemplate(text, vars),
      };

      // Handlers are async by contract even though none of them does I/O with
      // the recorders above, so they are awaited properly rather than assumed
      // to settle. The whole simulation is therefore async, which also leaves
      // room for a handler that one day does need to fetch something.
      const r = (resuming && handler.resume
        ? await handler.resume(ctx as never)
        : await handler.run(ctx as never)) as {
          outcome: { next: string; handle?: string; nodeId?: string };
          setVars?: FlowContext;
        };
      resuming = false;
      if (r.setVars) vars = { ...vars, ...r.setVars };

      const outcome = r.outcome;
      if (outcome.next === 'wait') {
        waitingAt = current.id;
        break;
      }
      if (outcome.next === 'sleep') {
        const until = computeWakeAt(current.data as WaitNodeData, now);
        events.push({
          kind: 'wait',
          nodeId: current.id,
          until: new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
          }).format(until),
        });
        // A real wait would pause here; the simulation carries on so the rest
        // of the flow can be read in one sitting.
        current = findNextNode(nodes, edges, current.id, 'default');
        continue;
      }
      if (outcome.next === 'end') {
        events.push({ kind: 'end', nodeId: current.id });
        finished = true;
        break;
      }
      if (outcome.next === 'handoff') {
        events.push({ kind: 'handoff', nodeId: current.id });
        finished = true;
        break;
      }
      if (outcome.next === 'goto') {
        current = nodes.find((n) => n.id === outcome.nodeId) ?? null;
        continue;
      }
      current = findNextNode(nodes, edges, current.id, outcome.handle);
      if (!current) {
        events.push({ kind: 'note', nodeId: visited[visited.length - 1] ?? '', text: 'Nothing is connected after this, so the flow ends here.' });
        finished = true;
        break;
      }
    }

    turns.push({ reply, visited, events, vars: { ...vars }, waitingAt, finished });
    if (waitingAt) resuming = true;
  }

  return turns;
}

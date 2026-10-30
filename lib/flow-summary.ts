// lib/flow-summary.ts
//
// A flow said out loud, in one paragraph.
//
// Reading a canvas takes knowing what the shapes mean. Reading a sentence does
// not, and the fastest way for a client to notice their flow is wrong is to see
// it described: "asks for their name, then says thank you" reads obviously
// backwards when the thank-you is above the question.
//
// Derived from the nodes every time, so it cannot drift from what the flow
// actually does — which a hand-written description always eventually does.

import type { FlowNode, FlowEdge } from '@/modules/flows/types';
import { toSteps, type FlowStep } from './flow-steps';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function firstWords(text: string, words = 6): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const parts = clean.split(' ');
  return parts.length <= words ? clean : `${parts.slice(0, words).join(' ')}…`;
}

/** What one step does, as a verb phrase that can sit in a list. */
export function describeStep(step: FlowStep): string {
  const d = (step.data ?? {}) as unknown as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');

  switch (step.type) {
    case 'message':
      return str('message') ? `sends “${firstWords(str('message'))}”` : 'sends a message';

    case 'question': {
      const saved = str('saveAsVariable');
      const asks = str('message') ? `asks “${firstWords(str('message'))}”` : 'asks a question';
      return saved ? `${asks} and saves the answer as ${saved}` : asks;
    }

    case 'media':
      return d.kind === 'location' ? 'sends a location pin' : `sends ${d.kind === 'document' ? 'a file' : `a ${String(d.kind ?? 'image')}`}`;

    case 'wait': {
      if (d.mode === 'time' && str('atTime')) {
        const day = typeof d.weekday === 'number' ? WEEKDAYS[d.weekday as number] : null;
        return day ? `waits until next ${day} at ${str('atTime')}` : `waits until ${str('atTime')}`;
      }
      const bits: string[] = [];
      for (const [key, unit] of [['days', 'day'], ['hours', 'hour'], ['minutes', 'minute']] as const) {
        const v = d[key];
        if (typeof v === 'number' && v > 0) bits.push(`${v} ${unit}${v === 1 ? '' : 's'}`);
      }
      return bits.length ? `waits ${bits.join(' ')}` : 'waits';
    }

    case 'action': {
      const ops = (d.operations as Array<{ type?: string }> | undefined) ?? [];
      if (ops.length === 0) return 'does nothing yet';
      const names = ops.map((o) => {
        switch (o.type) {
          case 'add_tags':        return 'tags the contact';
          case 'remove_tags':     return 'removes a tag';
          case 'set_temperature': return 'marks the lead';
          case 'set_field':       return 'saves a detail on the contact';
          case 'assign':          return 'assigns it to someone';
          case 'create_task':     return 'creates a task';
          case 'notify_team':     return 'notifies the team';
          case 'opt_out':         return 'stops messaging them';
          default:                return 'does something';
        }
      });
      return [...new Set(names)].join(' and ');
    }

    case 'template':
      return str('templateName')
        ? `sends the “${str('templateName')}” template`
        : 'sends a template';

    case 'collect': {
      const what = { name: 'a name', phone: 'a mobile number', email: 'an email',
        number: 'a number', date: 'a date', time: 'a time', any: 'an answer' }[String(d.expects ?? 'any')] ?? 'an answer';
      const saved = str('saveAsVariable');
      const asks = `asks for ${what} and checks it`;
      return saved ? `${asks}, saving it as ${saved}` : asks;
    }

    case 'ai_reply':
      return str('instruction')
        ? `answers from the knowledge base (${str('instruction')})`
        : 'answers from the knowledge base';

    case 'assign_agent':
      return 'hands the conversation to a person';

    case 'end':
      return str('message') ? `ends with “${firstWords(str('message'))}”` : 'ends';

    default:
      return `runs a ${step.type} step`;
  }
}

/** The first clause: what makes this flow start at all. */
export function describeTrigger(start: FlowNode | undefined): string {
  if (!start) return 'Nothing can start this flow — it has no Start step';
  const d = (start.data ?? {}) as unknown as Record<string, unknown>;
  if (d.triggerType === 'first_message') return 'When someone messages for the first time';
  const value = typeof d.triggerValue === 'string' ? d.triggerValue.trim() : '';
  return value
    ? `When someone says “${value}”`
    : 'This flow has no trigger yet, so it will never start';
}

/**
 * The whole flow as a sentence.
 *
 * A branching flow cannot be one sentence without lying about it, so it gets
 * the trigger plus an honest count instead of a flattened walk that would read
 * as though only one branch existed.
 */
export function describeFlow(nodes: FlowNode[], edges: FlowEdge[]): string {
  const start = nodes.find((n) => n.type === 'start');
  const trigger = describeTrigger(start);

  if (!start) return trigger + '.';

  const result = toSteps(nodes, edges);

  if (!result.ok) {
    const steps = nodes.filter((n) => n.type !== 'start').length;
    if (steps === 0) return `${trigger}, nothing happens yet.`;
    return `${trigger}, this flow runs ${steps} step${steps === 1 ? '' : 's'} and branches along the way — open the canvas to see where each answer goes.`;
  }

  if (result.steps.length === 0) return `${trigger}, nothing happens yet.`;

  const phrases = result.steps.map(describeStep);
  if (phrases.length === 1) return `${trigger}, the bot ${phrases[0]}.`;

  const last = phrases[phrases.length - 1]!;
  const rest = phrases.slice(0, -1);
  return `${trigger}, the bot ${rest.join(', ')}, then ${last}.`;
}

import { describe, it, expect } from 'vitest';
import { simulateFlow } from './flow-simulator';
import type { FlowNode, FlowEdge } from '@/modules/flows/types';

// These build partial nodes on purpose — each test supplies only the fields the
// node type under test reads — so the cast goes through `unknown`.
const node = (id: string, type: string, data: Record<string, unknown> = {}): FlowNode =>
  ({ id, type, data, position: { x: 0, y: 0 } } as unknown as FlowNode);
const edge = (source: string, target: string, sourceHandle?: string): FlowEdge =>
  ({ id: `${source}-${target}-${sourceHandle ?? ''}`, source, target, sourceHandle } as unknown as FlowEdge);

const bodies = (turn: { events: Array<{ kind: string; body?: string }> }) =>
  turn.events.filter((e) => e.kind === 'text' || e.kind === 'buttons').map((e) => e.body);

describe('simulateFlow — the flow that started all this', () => {
  // Fitness First's welcome flow, as it was saved: every node a `message`, so
  // the whole thing fired on the trigger keyword and the yes/no condition
  // judged the keyword instead of an answer. The simulator has to show that,
  // or it is not worth opening.
  const broken: FlowNode[] = [
    node('start', 'start', { triggerType: 'keyword', triggerValue: 'Know More' }),
    node('m1', 'message', { message: 'Welcome! Are you ready to explore the offer?' }),
    node('m2', 'message', { message: 'Amazing! Here is your Diwali offer.' }),
    node('m3', 'message', { message: 'May I know your name?' }),
    node('m4', 'message', { message: 'Which day would you like to visit?' }),
    node('end', 'end', { message: 'Thank you!' }),
  ];
  const brokenEdges = [
    edge('start', 'm1'), edge('m1', 'm2'), edge('m2', 'm3'),
    edge('m3', 'm4'), edge('m4', 'end'),
  ];

  it('shows every message landing in one turn', async () => {
    const turns = await simulateFlow(broken, brokenEdges, []);
    expect(turns).toHaveLength(1);
    expect(bodies(turns[0]!)).toHaveLength(5);
    expect(turns[0]!.waitingAt).toBeNull();
    expect(turns[0]!.finished).toBe(true);
  });

  // The same flow after migration 122 turned the asking nodes into questions.
  const fixed: FlowNode[] = [
    node('start', 'start', {}),
    node('q1', 'question', { message: 'Welcome! Are you ready?', timeoutHours: 48 }),
    node('m2', 'message', { message: 'Amazing! Here is your Diwali offer.' }),
    node('q2', 'question', { message: 'May I know your name?', saveAsVariable: 'name', timeoutHours: 48 }),
    node('m3', 'message', { message: 'Thank you, {{name}}!' }),
    node('end', 'end', { message: 'See you soon.' }),
  ];
  const fixedEdges = [
    edge('start', 'q1'), edge('q1', 'm2'), edge('m2', 'q2'),
    edge('q2', 'm3'), edge('m3', 'end'),
  ];

  it('stops at the first question and waits', async () => {
    const turns = await simulateFlow(fixed, fixedEdges, []);
    expect(bodies(turns[0]!)).toEqual(['Welcome! Are you ready?']);
    expect(turns[0]!.waitingAt).toBe('q1');
    expect(turns[0]!.finished).toBe(false);
  });

  it('carries the reply into the next question, and the answer into the copy', async () => {
    const turns = await simulateFlow(fixed, fixedEdges, ['Yes', 'Amit']);
    expect(turns).toHaveLength(3);
    expect(bodies(turns[1]!)).toEqual(['Amazing! Here is your Diwali offer.', 'May I know your name?']);
    // The saved answer renders where {{name}} was, which is the other bug the
    // editor used to allow: that placeholder went out raw for weeks.
    expect(bodies(turns[2]!)).toEqual(['Thank you, Amit!', 'See you soon.']);
    expect(turns[2]!.vars['name_text']).toBe('Amit');
    expect(turns[2]!.finished).toBe(true);
  });

  it('says so when a reply arrives after the flow has ended', async () => {
    const turns = await simulateFlow(fixed, fixedEdges, ['Yes', 'Amit', 'Hello?']);
    expect(turns[3]!.events[0]).toMatchObject({ kind: 'note' });
    expect(turns[3]!.events[0]!).toHaveProperty('text', expect.stringMatching(/ended/i));
  });
});

describe('simulateFlow — branching', () => {
  const nodes: FlowNode[] = [
    node('start', 'start', {}),
    node('q', 'question', {
      message: 'Interested?',
      answerMode: 'buttons',
      choices: [{ id: 'yes', title: 'Yes' }, { id: 'no', title: 'Not now' }],
    }),
    node('yes', 'message', { message: 'Great — here are the plans.' }),
    node('no', 'message', { message: 'No problem.' }),
    node('other', 'message', { message: 'Let me get someone to help.' }),
    node('end', 'end', {}),
  ];
  const edges = [
    edge('start', 'q'),
    edge('q', 'yes', 'choice_yes'),
    edge('q', 'no', 'choice_no'),
    edge('q', 'other', 'other'),
    edge('yes', 'end'), edge('no', 'end'), edge('other', 'end'),
  ];

  it('offers the buttons and takes the branch that was tapped', async () => {
    const turns = await simulateFlow(nodes, edges, ['Yes']);
    expect(turns[0]!.events[0]).toMatchObject({ kind: 'buttons', buttons: ['Yes', 'Not now'] });
    expect(bodies(turns[1]!)).toEqual(['Great — here are the plans.']);
  });

  it('takes the other branch when the customer types something else', async () => {
    const turns = await simulateFlow(nodes, edges, ['kitna price hai?']);
    expect(bodies(turns[1]!)).toEqual(['Let me get someone to help.']);
  });
});

describe('simulateFlow — what it reports rather than performs', () => {
  it('describes an action instead of doing it', async () => {
    const nodes = [
      node('start', 'start', {}),
      node('a', 'action', { operations: [{ type: 'add_tags', tags: ['hot-lead'] }, { type: 'set_temperature', temperature: 'hot' }] }),
      node('end', 'end', {}),
    ];
    const turns = await simulateFlow(nodes, [edge('start', 'a'), edge('a', 'end')], []);
    const actions = turns[0]!.events.filter((e) => e.kind === 'action');
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ description: expect.stringContaining('hot-lead') });
  });

  it('reports a wait and carries on, so the rest can be read in one sitting', async () => {
    const nodes = [
      node('start', 'start', {}),
      node('w', 'wait', { mode: 'duration', hours: 2 }),
      node('m', 'message', { message: 'Still interested?' }),
      node('end', 'end', {}),
    ];
    const turns = await simulateFlow(nodes, [edge('start', 'w'), edge('w', 'm'), edge('m', 'end')], []);
    expect(turns[0]!.events.some((e) => e.kind === 'wait')).toBe(true);
    expect(bodies(turns[0]!)).toEqual(['Still interested?']);
  });
});

describe('simulateFlow — flows that cannot run', () => {
  it('says a flow with no start node can never trigger', async () => {
    const turns = await simulateFlow([node('m', 'message', { message: 'hi' })], [], []);
    expect(turns[0]!.events[0]).toMatchObject({ kind: 'note' });
    expect(turns[0]!.events[0]!).toHaveProperty('text', expect.stringMatching(/no Start node/i));
  });

  it('says where a flow runs out of connections', async () => {
    const nodes = [node('start', 'start', {}), node('m', 'message', { message: 'hi' })];
    const turns = await simulateFlow(nodes, [edge('start', 'm')], []);
    expect(turns[0]!.events.some((e) => e.kind === 'note' && /Nothing is connected/i.test((e as { text: string }).text))).toBe(true);
  });

  // A menu that loops back on itself is a normal shape; the walk must stop.
  it('terminates on a cycle rather than running forever', async () => {
    const nodes = [
      node('start', 'start', {}),
      node('a', 'message', { message: 'round and round' }),
    ];
    const turns = await simulateFlow(nodes, [edge('start', 'a'), edge('a', 'a')], []);
    expect(turns[0]!.visited.length).toBeLessThanOrEqual(41);
  });
});

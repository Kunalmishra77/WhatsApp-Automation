import { describe, it, expect } from 'vitest';
import { toSteps, fromSteps } from './flow-steps';
import type { FlowNode, FlowEdge } from '@/modules/flows/types';

const node = (id: string, type: string, data: Record<string, unknown> = {}, pos = { x: 0, y: 0 }): FlowNode =>
  ({ id, type, data, position: pos } as unknown as FlowNode);
const edge = (source: string, target: string, sourceHandle?: string): FlowEdge =>
  ({ id: `${source}-${target}`, source, target, sourceHandle } as unknown as FlowEdge);

describe('toSteps — the flows that should be a list', () => {
  // Eight of the eighteen live flows are exactly this: start plus one message.
  it('reads a single auto-reply as one step', () => {
    const nodes = [node('s', 'start'), node('m', 'message', { message: 'Hi!' })];
    const r = toSteps(nodes, [edge('s', 'm')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.steps).toHaveLength(1);
      expect(r.steps[0]).toMatchObject({ id: 'm', type: 'message' });
    }
  });

  it('reads a longer straight line in order', () => {
    const nodes = [
      node('s', 'start'),
      node('m', 'message', { message: 'Welcome' }),
      node('q', 'question', { message: 'Your name?', saveAsVariable: 'name' }),
      node('a', 'action', { operations: [] }),
      node('e', 'end', { message: 'Bye' }),
    ];
    const edges = [edge('s', 'm'), edge('m', 'q'), edge('q', 'a'), edge('a', 'e')];
    const r = toSteps(nodes, edges);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.steps.map((x) => x.id)).toEqual(['m', 'q', 'a', 'e']);
  });

  it('is fine with a flow that is only a start node', () => {
    const r = toSteps([node('s', 'start')], []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.steps).toEqual([]);
  });
});

describe('toSteps — the flows that must stay on the canvas', () => {
  it('refuses a condition', () => {
    const nodes = [node('s', 'start'), node('c', 'condition'), node('y', 'message'), node('n', 'message')];
    const edges = [edge('s', 'c'), edge('c', 'y', 'yes'), edge('c', 'n', 'no')];
    const r = toSteps(nodes, edges);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/branches/i);
  });

  it('refuses a node with two ways out', () => {
    const nodes = [node('s', 'start'), node('m', 'message'), node('a', 'message'), node('b', 'message')];
    const r = toSteps(nodes, [edge('s', 'm'), edge('m', 'a'), edge('m', 'b')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/branches/i);
  });

  // Buttons are not a branch until they lead somewhere different. A question
  // whose choices all arrive at the same next step is still a straight line —
  // the customer just taps instead of typing.
  it('accepts a question whose choices all lead to the same step', () => {
    const nodes = [
      node('s', 'start'),
      node('q', 'question', { message: 'Interested?', choices: [{ id: 'y', title: 'Yes' }, { id: 'n', title: 'No' }] }),
      node('m', 'message', { message: 'Thanks' }),
    ];
    const edges = [
      edge('s', 'q'),
      edge('q', 'm', 'choice_y'), edge('q', 'm', 'choice_n'), edge('q', 'm', 'other'),
    ];
    const r = toSteps(nodes, edges);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.steps.map((x) => x.id)).toEqual(['q', 'm']);
  });

  it('refuses a question whose choices go different ways', () => {
    const nodes = [
      node('s', 'start'),
      node('q', 'question', { message: 'Interested?', choices: [{ id: 'y', title: 'Yes' }, { id: 'n', title: 'No' }] }),
      node('yes', 'message', { message: 'Great' }),
      node('no', 'message', { message: 'No problem' }),
    ];
    const r = toSteps(nodes, [edge('s', 'q'), edge('q', 'yes', 'choice_y'), edge('q', 'no', 'choice_n')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/branches/i);
  });

  // Saving from the step list must put the buttons' wiring back, or a round
  // trip through the list would quietly unwire every choice.
  it('puts a branch back for every choice on the way out', () => {
    const nodes = [
      node('s', 'start'),
      node('q', 'question', { message: 'Interested?', choices: [{ id: 'y', title: 'Yes' }, { id: 'n', title: 'No' }] }),
      node('m', 'message', { message: 'Thanks' }),
    ];
    const edges = [edge('s', 'q'), edge('q', 'm', 'choice_y'), edge('q', 'm', 'choice_n'), edge('q', 'm', 'other')];
    const r = toSteps(nodes, edges);
    if (!r.ok) throw new Error('expected a listable flow');
    const rebuilt = fromSteps(r.start, r.steps);
    const handles = rebuilt.edges.filter((e) => e.source === 'q').map((e) => e.sourceHandle).sort();
    expect(handles).toEqual(['choice_n', 'choice_y', 'other']);
  });

  it('refuses a loop', () => {
    const nodes = [node('s', 'start'), node('a', 'message'), node('b', 'message')];
    const r = toSteps(nodes, [edge('s', 'a'), edge('a', 'b'), edge('b', 'a')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/loops/i);
  });

  // The important one: a node the chain never reaches would be dropped from the
  // list, and saving from that list would delete it.
  it('refuses when a node is left off the chain, rather than losing it', () => {
    const nodes = [node('s', 'start'), node('m', 'message'), node('orphan', 'message', { message: 'written and forgotten' })];
    const r = toSteps(nodes, [edge('s', 'm')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not connected/i);
  });

  it('refuses a flow with no start node', () => {
    const r = toSteps([node('m', 'message')], []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no Start node/i);
  });
});

describe('round trip', () => {
  const nodes = [
    node('s', 'start', { triggerType: 'keyword', triggerValue: 'Know More' }, { x: 11, y: 22 }),
    node('m', 'message', { message: 'Welcome' }),
    node('q', 'question', { message: 'Your name?', saveAsVariable: 'name', timeoutHours: 48 }),
    node('e', 'end', { message: 'Bye' }),
  ];
  const edges = [edge('s', 'm'), edge('m', 'q'), edge('q', 'e')];

  it('keeps every node, its id, its type and its data', () => {
    const r = toSteps(nodes, edges);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rebuilt = fromSteps(r.start, r.steps);
    expect(rebuilt.nodes.map((n) => n.id)).toEqual(['s', 'm', 'q', 'e']);
    expect(rebuilt.nodes.map((n) => n.type)).toEqual(['start', 'message', 'question', 'end']);
    for (const original of nodes) {
      expect(rebuilt.nodes.find((n) => n.id === original.id)!.data).toEqual(original.data);
    }
  });

  it('keeps the chain connected, in order', () => {
    const r = toSteps(nodes, edges);
    if (!r.ok) throw new Error('expected a listable flow');
    const rebuilt = fromSteps(r.start, r.steps);
    expect(rebuilt.edges.map((e) => [e.source, e.target])).toEqual([['s', 'm'], ['m', 'q'], ['q', 'e']]);
  });

  it('leaves the start node where the author put it', () => {
    const r = toSteps(nodes, edges);
    if (!r.ok) throw new Error('expected a listable flow');
    expect(fromSteps(r.start, r.steps).nodes[0]!.position).toEqual({ x: 11, y: 22 });
  });

  it('survives a reorder without losing anything', () => {
    const r = toSteps(nodes, edges);
    if (!r.ok) throw new Error('expected a listable flow');
    const reordered = [r.steps[1]!, r.steps[0]!, r.steps[2]!];
    const rebuilt = fromSteps(r.start, reordered);
    expect(rebuilt.nodes.map((n) => n.id)).toEqual(['s', 'q', 'm', 'e']);
    expect(rebuilt.edges.map((e) => [e.source, e.target])).toEqual([['s', 'q'], ['q', 'm'], ['m', 'e']]);
    // Reading it back gives the new order, so the two views agree.
    const again = toSteps(rebuilt.nodes, rebuilt.edges);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.steps.map((s) => s.id)).toEqual(['q', 'm', 'e']);
  });

  it('lays steps out down the canvas so a reordered list is not jumbled', () => {
    const r = toSteps(nodes, edges);
    if (!r.ok) throw new Error('expected a listable flow');
    const ys = fromSteps(r.start, r.steps).nodes.slice(1).map((n) => n.position.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(new Set(ys).size).toBe(ys.length);
  });
});

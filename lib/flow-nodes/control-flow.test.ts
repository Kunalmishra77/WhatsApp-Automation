import { describe, it, expect } from 'vitest';
import { switchHandler, caseHandle, DEFAULT_HANDLE } from './switch';
import { jumpHandler } from './jump';
import { splitHandler, chooseVariant, splitHash, splitVarFor, variantHandle } from './split';
import { handlesForNode } from './index';
import { validateFlow } from '../flow-validate';
import type { NodeRunContext, FlowContext } from './types';
import type { FlowNode } from '@/modules/flows/types';

// A context with nothing in it that sends: none of these three nodes speaks, so
// a send facade that throws proves it.
function ctxFor(
  node: { id: string; type: string; data: unknown },
  over: { incoming?: string; vars?: FlowContext; sessionId?: string; nodes?: FlowNode[] } = {},
): NodeRunContext {
  const vars = over.vars ?? {};
  const refuse = () => { throw new Error('a control-flow node must not send anything'); };
  return {
    node: node as unknown as FlowNode,
    flow: { nodes: (over.nodes ?? [node as unknown as FlowNode]), edges: [] },
    incoming: over.incoming ?? '',
    vars,
    send: {
      text: refuse, buttons: refuse, media: refuse,
      location: refuse, list: refuse, template: refuse,
    } as unknown as NodeRunContext['send'],
    ops: {} as NodeRunContext['ops'],
    ai: { reply: async () => null },
    workspaceId: 'ws-1',
    conversationId: 'conv-1',
    sessionId: over.sessionId ?? 'sess-1',
    contactId: 'c-1',
    contactPhone: '919000000000',
    interpolate: (text: string) =>
      text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k: string) => String(vars[`${k}_text`] ?? vars[k] ?? '')),
  };
}

const SWITCH = {
  id: 'sw-1',
  type: 'switch',
  data: {
    label: 'Which service?',
    matchType: 'contains',
    cases: [
      { id: 'facial', match: 'facial' },
      { id: 'massage', match: 'massage' },
    ],
  },
};

describe('switch', () => {
  it('offers one branch per case, plus a default', () => {
    expect(handlesForNode('switch', SWITCH.data)).toEqual(['case_facial', 'case_massage', 'default']);
  });

  it('takes the branch whose case matches', async () => {
    const result = await switchHandler.run(ctxFor(SWITCH, { incoming: 'I want a massage please' }));
    expect(result.outcome).toEqual({ next: 'edge', handle: caseHandle('massage') });
  });

  // The rule the chained Conditions it replaces had implicitly, now stated.
  it('takes the FIRST match when a message matches two cases', async () => {
    const result = await switchHandler.run(ctxFor(SWITCH, { incoming: 'facial or massage?' }));
    expect(result.outcome).toEqual({ next: 'edge', handle: caseHandle('facial') });
  });

  // The branch people forget to draw, which is why it is a real handle.
  it('takes default when nothing matches', async () => {
    const result = await switchHandler.run(ctxFor(SWITCH, { incoming: 'do you do haircuts?' }));
    expect(result.outcome).toEqual({ next: 'edge', handle: DEFAULT_HANDLE });
  });

  it('takes default when there are no cases at all', async () => {
    const bare = { id: 'sw-1', type: 'switch', data: { cases: [] } };
    const result = await switchHandler.run(ctxFor(bare, { incoming: 'anything' }));
    expect(result.outcome).toEqual({ next: 'edge', handle: DEFAULT_HANDLE });
    expect(handlesForNode('switch', bare.data)).toEqual([DEFAULT_HANDLE]);
  });

  it('honours equals and starts_with, like a condition does', async () => {
    const node = (matchType: string) => ({
      id: 'sw-1', type: 'switch',
      data: { matchType, cases: [{ id: 'yes', match: 'yes' }] },
    });
    expect((await switchHandler.run(ctxFor(node('equals'), { incoming: 'yes' }))).outcome)
      .toEqual({ next: 'edge', handle: caseHandle('yes') });
    expect((await switchHandler.run(ctxFor(node('equals'), { incoming: 'yes please' }))).outcome)
      .toEqual({ next: 'edge', handle: DEFAULT_HANDLE });
    expect((await switchHandler.run(ctxFor(node('starts_with'), { incoming: 'yes please' }))).outcome)
      .toEqual({ next: 'edge', handle: caseHandle('yes') });
  });

  // A switch on a saved answer reads the words the customer typed, not the
  // number they were parsed into.
  it('judges a saved answer when the source is a variable', async () => {
    const node = {
      id: 'sw-1', type: 'switch',
      data: { source: 'variable', variable: 'city', matchType: 'equals', cases: [{ id: 'pune', match: 'Pune' }] },
    };
    const vars = { city: 0, city_text: 'Pune' };
    expect((await switchHandler.run(ctxFor(node, { incoming: 'unrelated', vars }))).outcome)
      .toEqual({ next: 'edge', handle: caseHandle('pune') });
  });

  it('takes default when the variable it reads was never saved', async () => {
    const node = {
      id: 'sw-1', type: 'switch',
      data: { source: 'variable', variable: 'city', cases: [{ id: 'pune', match: 'Pune' }] },
    };
    expect((await switchHandler.run(ctxFor(node, { incoming: 'Pune' }))).outcome)
      .toEqual({ next: 'edge', handle: DEFAULT_HANDLE });
  });

  // The comparison a Condition cannot make: this answer against that answer.
  it('compares one saved answer against another', async () => {
    const node = {
      id: 'sw-1', type: 'switch',
      data: {
        source: 'variable', variable: 'city', matchType: 'equals',
        cases: [{ id: 'same', match: '{{home_city}}' }],
      },
    };
    const vars = { city_text: 'Pune', home_city_text: 'Pune' };
    expect((await switchHandler.run(ctxFor(node, { vars }))).outcome)
      .toEqual({ next: 'edge', handle: caseHandle('same') });

    const other = { city_text: 'Pune', home_city_text: 'Mumbai' };
    expect((await switchHandler.run(ctxFor(node, { vars: other }))).outcome)
      .toEqual({ next: 'edge', handle: DEFAULT_HANDLE });
  });

  it('reports the variables it reads', () => {
    expect(switchHandler.describe?.(SWITCH.data)).toEqual({ readsVars: [] });
    expect(switchHandler.describe?.({
      source: 'variable', variable: 'city', cases: [{ id: 'a', match: '{{home_city}}' }],
    })).toEqual({ readsVars: ['city', 'home_city'] });
  });
});

describe('jump', () => {
  const target: FlowNode = { id: 'tail-1', type: 'message', position: { x: 0, y: 0 }, data: { label: 'Tail', message: 'bye' } } as FlowNode;
  const node = { id: 'j-1', type: 'jump', data: { targetNodeId: 'tail-1' } };

  it('has no branches of its own', () => {
    expect(handlesForNode('jump', node.data)).toEqual([]);
  });

  it('continues at the step it names', async () => {
    const result = await jumpHandler.run(ctxFor(node, { nodes: [node as unknown as FlowNode, target] }));
    expect(result.outcome).toEqual({ next: 'goto', nodeId: 'tail-1' });
  });

  it('ends the session when nothing is chosen', async () => {
    const result = await jumpHandler.run(ctxFor({ id: 'j-1', type: 'jump', data: {} }));
    expect(result.outcome).toEqual({ next: 'end' });
  });

  // The author deleted the shared tail and kept the Jumps into it.
  it('ends the session when the step it names is gone', async () => {
    const result = await jumpHandler.run(ctxFor(node, { nodes: [node as unknown as FlowNode] }));
    expect(result.outcome).toEqual({ next: 'end' });
  });
});

describe('split', () => {
  const two = {
    id: 'sp-1', type: 'split',
    data: { variants: [{ id: 'a' }, { id: 'b' }] },
  };

  it('offers one branch per variant', () => {
    expect(handlesForNode('split', two.data)).toEqual(['variant_a', 'variant_b']);
  });

  // The reason this is a hash and not Math.random: a customer who goes quiet
  // and replies tomorrow must land in the same arm, or the conversation
  // contradicts itself and the result means nothing.
  it('gives a session the same branch every time', async () => {
    const first = await splitHandler.run(ctxFor(two, { sessionId: 'sess-xyz' }));
    const again = await splitHandler.run(ctxFor(two, { sessionId: 'sess-xyz' }));
    expect(again.outcome).toEqual(first.outcome);
  });

  it('records which arm the session landed in', async () => {
    const result = await splitHandler.run(ctxFor(two, { sessionId: 'sess-xyz' }));
    const chosen = (result.outcome as { handle: string }).handle.replace('variant_', '');
    expect(result.setVars).toEqual({ [splitVarFor('sp-1')]: chosen });
  });

  it('puts different sessions in different arms', () => {
    const arms = new Set(
      Array.from({ length: 200 }, (_, i) => chooseVariant(two.data.variants, `sess-${i}`, 'sp-1')?.id),
    );
    expect(arms).toEqual(new Set(['a', 'b']));
  });

  it('splits an unweighted pair roughly evenly', () => {
    let a = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (chooseVariant(two.data.variants, `sess-${i}`, 'sp-1')?.id === 'a') a += 1;
    }
    expect(a).toBeGreaterThan(850);
    expect(a).toBeLessThan(1150);
  });

  it('respects weights', () => {
    const weighted = [{ id: 'a', weight: 9 }, { id: 'b', weight: 1 }];
    let a = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (chooseVariant(weighted, `sess-${i}`, 'sp-1')?.id === 'a') a += 1;
    }
    expect(a).toBeGreaterThan(1700);
    expect(a).toBeLessThan(1900);
  });

  // Ending an experiment without deleting the losing arm, while sessions are
  // still parked inside it.
  it('sends nobody down a variant weighted zero', () => {
    const retired = [{ id: 'a', weight: 0 }, { id: 'b', weight: 1 }];
    for (let i = 0; i < 100; i += 1) {
      expect(chooseVariant(retired, `sess-${i}`, 'sp-1')?.id).toBe('b');
    }
  });

  it('follows the plain edge when every variant is retired', async () => {
    const off = { id: 'sp-1', type: 'split', data: { variants: [{ id: 'a', weight: 0 }] } };
    const result = await splitHandler.run(ctxFor(off));
    expect(result.outcome).toEqual({ next: 'edge' });
    expect(result.setVars).toBeUndefined();
  });

  it('follows the plain edge when there are no variants', async () => {
    const result = await splitHandler.run(ctxFor({ id: 'sp-1', type: 'split', data: {} }));
    expect(result.outcome).toEqual({ next: 'edge' });
  });

  // This is the test that caught the hash: "sess:sp-1" and "sess:sp-2" differ
  // only in the last byte, and FNV-1a alone barely carries that into the high
  // bits the arm is read from — so every session took the same arm in both
  // splits, and two experiments silently measured the same half of the
  // audience. Two independent coin flips should disagree about half the time.
  it('decides two splits in one flow independently', () => {
    let differed = 0;
    for (let i = 0; i < 1000; i += 1) {
      const a = chooseVariant(two.data.variants, `s-${i}`, 'sp-1')?.id;
      const b = chooseVariant(two.data.variants, `s-${i}`, 'sp-2')?.id;
      if (a !== b) differed += 1;
    }
    expect(differed).toBeGreaterThan(400);
    expect(differed).toBeLessThan(600);
  });

  it('hashes into [0, 1)', () => {
    for (let i = 0; i < 500; i += 1) {
      const h = splitHash(`sess-${i}`, 'sp-1');
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});

describe('the validator and a Jump', () => {
  // Without treating a Jump as a connection, the shared tail reads as
  // unreachable and the Jump as a dead end: two confident warnings about a flow
  // that works, which is how a validator gets ignored.
  const flow = {
    nodes: [
      { id: 'start-1', type: 'start', data: { triggerType: 'keyword', triggerValue: 'hi' } },
      { id: 'm-1', type: 'message', data: { message: 'Namaste' } },
      { id: 'j-1', type: 'jump', data: { targetNodeId: 'tail-1' } },
      { id: 'tail-1', type: 'end', data: { message: 'Dhanyavaad' } },
    ],
    edges: [
      { source: 'start-1', target: 'm-1' },
      { source: 'm-1', target: 'j-1' },
    ],
  };

  it('treats a Jump as a way through', () => {
    expect(validateFlow(flow.nodes, flow.edges)).toEqual([]);
  });

  it('flags a Jump with nothing chosen', () => {
    const nodes = flow.nodes.map((n) => (n.id === 'j-1' ? { ...n, data: {} } : n));
    const kinds = validateFlow(nodes, flow.edges).map((w) => w.kind);
    expect(kinds).toContain('jump_without_target');
    // And the tail is genuinely unreachable now, which is the truth.
    expect(kinds).toContain('unreachable');
  });

  it('flags a Jump whose step was deleted', () => {
    const nodes = flow.nodes.filter((n) => n.id !== 'tail-1');
    const w = validateFlow(nodes, flow.edges);
    expect(w.map((x) => x.kind)).toContain('jump_target_missing');
    expect(w.find((x) => x.kind === 'jump_target_missing')!.message).toContain('tail-1');
  });

  it('does not call a Jump a dead end', () => {
    const w = validateFlow(flow.nodes, flow.edges);
    expect(w.some((x) => x.kind === 'dead_end' && x.nodeId === 'j-1')).toBe(false);
  });

  it('lets several branches share one tail', () => {
    const shared = {
      nodes: [
        { id: 'start-1', type: 'start', data: { triggerType: 'keyword', triggerValue: 'hi' } },
        { id: 'sw-1', type: 'switch', data: { cases: [{ id: 'a', match: 'a' }, { id: 'b', match: 'b' }] } },
        { id: 'm-a', type: 'message', data: { message: 'A' } },
        { id: 'm-b', type: 'message', data: { message: 'B' } },
        { id: 'm-d', type: 'message', data: { message: 'Neither' } },
        { id: 'j-a', type: 'jump', data: { targetNodeId: 'tail-1' } },
        { id: 'j-b', type: 'jump', data: { targetNodeId: 'tail-1' } },
        { id: 'j-d', type: 'jump', data: { targetNodeId: 'tail-1' } },
        { id: 'tail-1', type: 'end', data: { message: 'Our team will call you.' } },
      ],
      edges: [
        { source: 'start-1', target: 'sw-1' },
        { source: 'sw-1', target: 'm-a' },
        { source: 'sw-1', target: 'm-b' },
        { source: 'sw-1', target: 'm-d' },
        { source: 'm-a', target: 'j-a' },
        { source: 'm-b', target: 'j-b' },
        { source: 'm-d', target: 'j-d' },
      ],
    };
    expect(validateFlow(shared.nodes, shared.edges)).toEqual([]);
  });
});

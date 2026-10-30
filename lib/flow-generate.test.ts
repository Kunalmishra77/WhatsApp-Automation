import { describe, it, expect } from 'vitest';
import { FLOW_SYSTEM_PROMPT, extractJsonObject, parseGeneratedFlow } from './flow-generate';
import { NODE_HANDLERS } from './flow-nodes';
import { validateFlow } from './flow-validate';

describe('FLOW_SYSTEM_PROMPT', () => {
  // The bug this replaces: the prompt knew six node types while the palette had
  // thirteen, so every generated flow was built from the May version of the
  // editor. If a node is added without being described here, that happens again.
  it('describes every node type the builder can run', () => {
    for (const type of Object.keys(NODE_HANDLERS)) {
      expect(FLOW_SYSTEM_PROMPT, `node type "${type}" missing from the prompt`)
        .toContain(`"${type}"`);
    }
  });

  it('names the branch handles the engine actually matches on', () => {
    for (const handle of ['choice_<id>', 'gave_up', '"yes"', '"no"', '"ok"', '"failed"']) {
      expect(FLOW_SYSTEM_PROMPT).toContain(handle);
    }
  });

  // The 24-hour window is the one rule a flow cannot recover from at runtime:
  // a plain message after a long wait sends nothing and nobody is told.
  it('states the 24-hour template rule', () => {
    expect(FLOW_SYSTEM_PROMPT).toMatch(/24 hours[\s\S]*template|template[\s\S]*24 hours/i);
  });
});

describe('extractJsonObject', () => {
  it('reads plain JSON', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('strips a json fence', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a bare fence', () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('finds the object after a sentence the model added', () => {
    expect(extractJsonObject('Here is your flow:\n{"a":1}\nHope that helps!')).toBe('{"a":1}');
  });

  it('returns null when there is no object at all', () => {
    expect(extractJsonObject('I cannot help with that.')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

const good = {
  name: 'Gym enquiry',
  description: 'Greets and books a trial',
  trigger_type: 'keyword',
  trigger_value: 'Know More',
  nodes: [
    { id: 'n1', type: 'start', position: { x: 250, y: 50 }, data: { label: 'Start', triggerType: 'keyword', triggerValue: 'Know More' } },
    { id: 'n2', type: 'message', position: { x: 250, y: 200 }, data: { label: 'Welcome', message: 'Namaste! 😊' } },
    { id: 'n3', type: 'collect', position: { x: 250, y: 350 }, data: { label: 'Ask name', message: 'Aapka naam?', expects: 'name', saveAsVariable: 'name', maxAttempts: 2 } },
    { id: 'n4', type: 'end', position: { x: 250, y: 500 }, data: { label: 'Done', message: 'Dhanyavaad {{name}}!' } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
  ],
};

describe('parseGeneratedFlow', () => {
  it('passes a well-formed flow through untouched', () => {
    const result = parseGeneratedFlow(JSON.stringify(good))!;
    expect(result.repairs).toEqual([]);
    expect(result.flow.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(result.flow.trigger_value).toBe('Know More');
  });

  // The whole point of the rewrite: a flow handed to the author must not warn
  // in the editor it is about to open in.
  it('produces a flow the editor does not warn about', () => {
    const { flow } = parseGeneratedFlow(JSON.stringify(good))!;
    expect(validateFlow(flow.nodes, flow.edges)).toEqual([]);
  });

  it('returns null on anything that is not a flow', () => {
    expect(parseGeneratedFlow('not json')).toBeNull();
    expect(parseGeneratedFlow('{"nodes":[]}')).toBeNull();
    expect(parseGeneratedFlow('[1,2,3]')).toBeNull();
    expect(parseGeneratedFlow('{"nodes":"lots"}')).toBeNull();
  });

  // The engine ends the session on a type it cannot run, so the node has to go.
  it('removes a step type the builder does not have, and says so', () => {
    const bad = {
      ...good,
      nodes: [...good.nodes, { id: 'n5', type: 'send_sms', position: { x: 0, y: 0 }, data: {} }],
      edges: [...good.edges, { id: 'e4', source: 'n4', target: 'n5' }],
    };
    const result = parseGeneratedFlow(JSON.stringify(bad))!;
    expect(result.flow.nodes.some((n) => n.id === 'n5')).toBe(false);
    // Its edge goes with it, or the flow would end at a node that is not there.
    expect(result.flow.edges.some((e) => e.target === 'n5')).toBe(false);
    expect(result.repairs.join(' ')).toContain('send_sms');
  });

  it('removes an edge to a node the model never wrote', () => {
    const bad = { ...good, edges: [...good.edges, { id: 'e9', source: 'n4', target: 'nowhere' }] };
    const result = parseGeneratedFlow(JSON.stringify(bad))!;
    expect(result.flow.edges.some((e) => e.target === 'nowhere')).toBe(false);
    expect(result.repairs.join(' ')).toContain('nowhere');
  });

  // Without a start node the engine refuses the flow and the editor shows no
  // reason, so one is added and wired to whatever came first.
  it('adds a missing start and connects it', () => {
    const headless = { ...good, nodes: good.nodes.slice(1), edges: good.edges.slice(1) };
    const result = parseGeneratedFlow(JSON.stringify(headless))!;
    const start = result.flow.nodes.find((n) => n.type === 'start')!;
    expect(start).toBeTruthy();
    expect(result.flow.edges.some((e) => e.source === start.id && e.target === 'n2')).toBe(true);
    expect(result.repairs.join(' ')).toContain('Start');
  });

  it('keeps the only start when there already is one', () => {
    const result = parseGeneratedFlow(JSON.stringify(good))!;
    expect(result.flow.nodes.filter((n) => n.type === 'start')).toHaveLength(1);
    expect(result.repairs).toEqual([]);
  });

  it('renames a duplicate id rather than losing the second step', () => {
    const dupe = {
      ...good,
      nodes: [...good.nodes, { id: 'n2', type: 'message', position: { x: 0, y: 0 }, data: { message: 'again' } }],
    };
    const result = parseGeneratedFlow(JSON.stringify(dupe))!;
    expect(result.flow.nodes).toHaveLength(5);
    expect(new Set(result.flow.nodes.map((n) => n.id)).size).toBe(5);
  });

  it('gives a step with no id and no position both', () => {
    const sparse = { ...good, nodes: [...good.nodes, { type: 'message', data: { message: 'hi' } }] };
    const result = parseGeneratedFlow(JSON.stringify(sparse))!;
    const added = result.flow.nodes[4]!;
    expect(added.id).toBeTruthy();
    expect(Number.isFinite(added.position.x)).toBe(true);
    expect(Number.isFinite(added.position.y)).toBe(true);
  });

  it('labels a step the model left unlabelled, so the canvas is readable', () => {
    const sparse = { ...good, nodes: [...good.nodes, { id: 'n5', type: 'ai_reply', position: { x: 0, y: 0 }, data: {} }] };
    const result = parseGeneratedFlow(JSON.stringify(sparse))!;
    expect((result.flow.nodes[4]!.data as { label?: string }).label).toBe('ai reply');
  });

  // Deliberately NOT repaired: picking a different branch would be a guess the
  // author never sees. It is kept, and reported so they can look.
  it('keeps a branch handle that does not match, and flags it', () => {
    const wrong = {
      ...good,
      nodes: [
        ...good.nodes,
        { id: 'c1', type: 'condition', position: { x: 250, y: 650 }, data: { label: 'Hot?', keyword: 'price', matchType: 'contains' } },
      ],
      edges: [...good.edges, { id: 'e5', source: 'c1', target: 'n4', sourceHandle: 'maybe' }],
    };
    const result = parseGeneratedFlow(JSON.stringify(wrong))!;
    const edge = result.flow.edges.find((e) => e.id === 'e5')!;
    expect((edge as { sourceHandle?: string }).sourceHandle).toBe('maybe');
    expect(result.repairs.join(' ')).toContain('yes, no');
  });

  it('says nothing about a branch handle that does match', () => {
    const right = {
      ...good,
      nodes: [
        ...good.nodes,
        { id: 'c1', type: 'condition', position: { x: 250, y: 650 }, data: { label: 'Hot?', keyword: 'price', matchType: 'contains' } },
      ],
      edges: [...good.edges, { id: 'e5', source: 'c1', target: 'n4', sourceHandle: 'yes' }],
    };
    expect(parseGeneratedFlow(JSON.stringify(right))!.repairs).toEqual([]);
  });

  it('drops the trigger value when the trigger is the first message', () => {
    const first = { ...good, trigger_type: 'first_message', trigger_value: 'ignored' };
    expect(parseGeneratedFlow(JSON.stringify(first))!.flow.trigger_value).toBeNull();
  });

  it('falls back to the start node’s own trigger value', () => {
    const noTop = { ...good, trigger_value: undefined };
    expect(parseGeneratedFlow(JSON.stringify(noTop))!.flow.trigger_value).toBe('Know More');
  });

  it('names an unnamed flow rather than saving an empty title', () => {
    const noName = { ...good, name: '   ' };
    expect(parseGeneratedFlow(JSON.stringify(noName))!.flow.name).toBe('Untitled flow');
  });

  it('reads a flow the model wrapped in a fence', () => {
    expect(parseGeneratedFlow('```json\n' + JSON.stringify(good) + '\n```')!.flow.name).toBe('Gym enquiry');
  });
});

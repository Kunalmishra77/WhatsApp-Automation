import { describe, it, expect } from 'vitest';
import { describeVersionChange } from './flow-versions';

const node = (id: string, over: Record<string, unknown> = {}) => ({
  id, type: 'message', position: { x: 0, y: 0 }, data: { label: id, message: 'hi' }, ...over,
});
const edge = (id: string, source: string, target: string) => ({ id, source, target });

const base = {
  name: 'Welcome',
  nodes: [node('start-1', { type: 'start' }), node('m1'), node('m2')],
  edges: [edge('e1', 'start-1', 'm1'), edge('e2', 'm1', 'm2')],
};

describe('describeVersionChange', () => {
  it('says where the history runs out', () => {
    expect(describeVersionChange(base, null)).toBe('Earliest version kept');
  });

  it('counts steps added', () => {
    const next = { ...base, nodes: [...base.nodes, node('m3')] };
    expect(describeVersionChange(next, base)).toBe('Added 1 step');
  });

  it('counts steps removed', () => {
    const next = { ...base, nodes: base.nodes.filter((n) => n.id !== 'm2') };
    expect(describeVersionChange(next, base)).toBe('Removed 1 step');
  });

  it('pluralises', () => {
    const next = { ...base, nodes: [...base.nodes, node('m3'), node('m4')] };
    expect(describeVersionChange(next, base)).toBe('Added 2 steps');
  });

  it('notices a step whose wording changed', () => {
    const next = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'm1' ? node('m1', { data: { label: 'm1', message: 'Namaste' } }) : n)),
    };
    expect(describeVersionChange(next, base)).toBe('Changed 1 step');
  });

  // Dragging a node around the canvas is not an edit anyone wants listed, which
  // is why position is left out of the comparison.
  it('does not call a drag an edit', () => {
    const next = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'm1' ? { ...n, position: { x: 900, y: 400 } } : n)),
    };
    expect(describeVersionChange(next, base)).toBe('Moved steps on the canvas');
  });

  it('says plainly when a save changed nothing it can see', () => {
    expect(describeVersionChange({ ...base }, base)).toBe('Moved steps on the canvas');
  });

  it('notices a step whose type changed', () => {
    const next = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'm1' ? { ...n, type: 'ai_reply' } : n)),
    };
    expect(describeVersionChange(next, base)).toBe('Changed 1 step');
  });

  it('reports connections added and removed', () => {
    const connected = { ...base, edges: [...base.edges, edge('e3', 'm2', 'm1')] };
    expect(describeVersionChange(connected, base)).toBe('Connected 1 step');

    const cut = { ...base, edges: [base.edges[0]!] };
    expect(describeVersionChange(cut, base)).toBe('Disconnected 1 step');
  });

  // Rewiring shows up as both an add and a remove; reporting it twice reads as
  // two separate things happening.
  it('calls a rewire a rewire', () => {
    const next = { ...base, edges: [edge('e1', 'start-1', 'm1'), edge('e9', 'm1', 'm2')] };
    expect(describeVersionChange(next, base)).toBe('Rewired connections');
  });

  it('notices a rename', () => {
    expect(describeVersionChange({ ...base, name: 'Welcome v2' }, base)).toBe('Renamed the flow');
  });

  it('combines several changes in one line', () => {
    const next = {
      name: 'Welcome v2',
      nodes: [node('start-1', { type: 'start' }), node('m1'), node('m3')],
      edges: [edge('e1', 'start-1', 'm1'), edge('e5', 'm1', 'm3')],
    };
    expect(describeVersionChange(next, base))
      .toBe('Added 1 step, removed 1 step, rewired connections, renamed the flow');
  });

  // An added step must not also be counted as changed, or every addition would
  // read as two things.
  it('does not count an added step as changed as well', () => {
    const next = { ...base, nodes: [...base.nodes, node('m3')] };
    expect(describeVersionChange(next, base)).not.toContain('changed');
  });

  it('survives nodes and edges that are not arrays', () => {
    const broken = { name: 'x', nodes: null, edges: undefined };
    expect(() => describeVersionChange(broken, base)).not.toThrow();
    expect(describeVersionChange(broken, base)).toContain('Removed 3 steps');
  });

  it('survives a node with no id', () => {
    const next = { ...base, nodes: [...base.nodes, { type: 'message', data: {} }] };
    expect(describeVersionChange(next, base)).toBe('Moved steps on the canvas');
  });
});

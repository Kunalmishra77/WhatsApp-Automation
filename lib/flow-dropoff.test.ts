import { describe, it, expect } from 'vitest';
import { buildDropoff, summariseDropoff, MIN_TRAFFIC_TO_BLAME, type DropoffRow } from './flow-dropoff';

const NODES = [
  { id: 'start-1', type: 'start', data: { label: 'Start' } },
  { id: 'm1', type: 'message', data: { label: 'Welcome' } },
  { id: 'q1', type: 'question', data: { label: 'Which service?' } },
  { id: 'm2', type: 'message', data: { label: 'Price list' } },
  { id: 'end-1', type: 'end', data: { label: 'Thanks' } },
];

// The numbers the SQL returns for a flow where people leave at the question —
// the same shape verified against Postgres with a synthetic path set.
const ROWS: DropoffRow[] = [
  { node_id: 'start-1', reached: 100, stopped: 0 },
  { node_id: 'm1', reached: 100, stopped: 8 },
  { node_id: 'q1', reached: 92, stopped: 60 },
  { node_id: 'm2', reached: 32, stopped: 2 },
  { node_id: 'end-1', reached: 30, stopped: 30 },
];

describe('buildDropoff', () => {
  it('keeps the flow’s own order', () => {
    expect(buildDropoff(NODES, ROWS).map((s) => s.nodeId)).toEqual(['m1', 'q1', 'm2', 'end-1']);
  });

  // Start's arrivals are the session count and its stops are always zero, so
  // the row can only ever say the same thing.
  it('leaves the Start step out', () => {
    expect(buildDropoff(NODES, ROWS).some((s) => s.type === 'start')).toBe(false);
  });

  it('carries arrivals, stops and the share', () => {
    const q1 = buildDropoff(NODES, ROWS).find((s) => s.nodeId === 'q1')!;
    expect(q1).toMatchObject({ reached: 92, stopped: 60, stoppedPct: 65, label: 'Which service?' });
  });

  // The number that matters: the question loses 60 people, the welcome loses 8.
  it('names the step losing the most people', () => {
    const steps = buildDropoff(NODES, ROWS);
    expect(steps.find((s) => s.isWorst)?.nodeId).toBe('q1');
    expect(steps.filter((s) => s.isWorst)).toHaveLength(1);
  });

  // Without this an End step reads as 100% drop-off and the one step that is
  // working looks like the problem.
  it('never blames an ending, however many stop there', () => {
    const steps = buildDropoff(NODES, ROWS);
    const end = steps.find((s) => s.nodeId === 'end-1')!;
    expect(end.isEnding).toBe(true);
    expect(end.stoppedPct).toBe(100);
    expect(end.isWorst).toBe(false);
  });

  it('treats a handoff as an ending too', () => {
    const nodes = [...NODES, { id: 'h1', type: 'assign_agent', data: { label: 'To the team' } }];
    const rows = [...ROWS, { node_id: 'h1', reached: 40, stopped: 40 }];
    const h1 = buildDropoff(nodes, rows).find((s) => s.nodeId === 'h1')!;
    expect(h1.isEnding).toBe(true);
    expect(h1.isWorst).toBe(false);
  });

  // Calling a step with three arrivals "the problem" is how a report sends
  // someone off to rewrite the wrong message.
  it('will not blame a step too few people reached', () => {
    const rows: DropoffRow[] = [
      { node_id: 'm1', reached: 5, stopped: 5 },
      { node_id: 'q1', reached: 0, stopped: 0 },
    ];
    expect(buildDropoff(NODES, rows).some((s) => s.isWorst)).toBe(false);
  });

  it('blames a step at exactly the traffic threshold', () => {
    const rows: DropoffRow[] = [{ node_id: 'm1', reached: MIN_TRAFFIC_TO_BLAME, stopped: 4 }];
    expect(buildDropoff(NODES, rows).find((s) => s.isWorst)?.nodeId).toBe('m1');
  });

  // A step nobody reached is usually the step after the one people are leaving.
  it('keeps a step with no sessions rather than hiding it', () => {
    const steps = buildDropoff(NODES, [{ node_id: 'm1', reached: 10, stopped: 10 }]);
    const m2 = steps.find((s) => s.nodeId === 'm2')!;
    expect(m2).toMatchObject({ reached: 0, stopped: 0, stoppedPct: 0, isWorst: false });
  });

  it('counts the SQL’s bigints when they arrive as strings', () => {
    const steps = buildDropoff(NODES, [{ node_id: 'q1', reached: '92', stopped: '60' }]);
    expect(steps.find((s) => s.nodeId === 'q1')).toMatchObject({ reached: 92, stopped: 60, stoppedPct: 65 });
  });

  it('falls back to the step type when the author left the label blank', () => {
    const nodes = [{ id: 'a1', type: 'ai_reply', data: { label: '  ' } }];
    expect(buildDropoff(nodes, []).at(0)?.label).toBe('ai reply');
  });

  it('survives rows for steps that are no longer in the flow', () => {
    const steps = buildDropoff(NODES, [...ROWS, { node_id: 'deleted', reached: 50, stopped: 50 }]);
    expect(steps.some((s) => s.nodeId === 'deleted')).toBe(false);
    expect(steps.find((s) => s.isWorst)?.nodeId).toBe('q1');
  });
});

describe('summariseDropoff', () => {
  it('says plainly when nothing has run', () => {
    expect(summariseDropoff(buildDropoff(NODES, []), 0))
      .toBe('Nobody has been through this flow in this period.');
  });

  it('gives the completion rate and where people leave', () => {
    const line = summariseDropoff(buildDropoff(NODES, ROWS), 100);
    expect(line).toContain('100 people started, 30% reached the end');
    expect(line).toContain('"Which service?"');
    expect(line).toContain('60 of 92');
  });

  // A confident-looking conclusion from four sessions is worse than admitting
  // the flow has not run enough times.
  it('admits it cannot tell yet on thin traffic', () => {
    const rows: DropoffRow[] = [{ node_id: 'm1', reached: 4, stopped: 4 }];
    expect(summariseDropoff(buildDropoff(NODES, rows), 4))
      .toContain('Too few so far');
  });

  it('counts every ending toward completion, not just the End step', () => {
    const nodes = [...NODES, { id: 'h1', type: 'assign_agent', data: { label: 'To the team' } }];
    const rows = [...ROWS, { node_id: 'h1', reached: 20, stopped: 20 }];
    expect(summariseDropoff(buildDropoff(nodes, rows), 100)).toContain('50% reached the end');
  });

  it('says one person, not 1 people', () => {
    expect(summariseDropoff(buildDropoff(NODES, [{ node_id: 'end-1', reached: 1, stopped: 1 }]), 1))
      .toContain('1 person started');
  });
});

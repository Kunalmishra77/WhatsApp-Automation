import { describe, it, expect } from 'vitest';
import { describeFlow, describeTrigger, describeStep } from './flow-summary';
import type { FlowNode, FlowEdge } from '@/modules/flows/types';

const node = (id: string, type: string, data: Record<string, unknown> = {}): FlowNode =>
  ({ id, type, data, position: { x: 0, y: 0 } } as unknown as FlowNode);
const edge = (source: string, target: string, sourceHandle?: string): FlowEdge =>
  ({ id: `${source}-${target}`, source, target, sourceHandle } as unknown as FlowEdge);
const step = (type: string, data: Record<string, unknown>) =>
  ({ id: 'x', type, data } as never);

describe('describeTrigger', () => {
  it('quotes the keyword a customer has to send', () => {
    expect(describeTrigger(node('s', 'start', { triggerType: 'keyword', triggerValue: 'Book Now' })))
      .toContain('Book Now');
  });

  it('names the first-message case', () => {
    expect(describeTrigger(node('s', 'start', { triggerType: 'first_message' })))
      .toMatch(/first time/i);
  });

  // Four live flows had an empty trigger value at one point; silence about it
  // would be the least useful thing a summary could do.
  it('says plainly when there is no trigger', () => {
    expect(describeTrigger(node('s', 'start', { triggerType: 'keyword', triggerValue: '  ' })))
      .toMatch(/never start/i);
  });

  it('says plainly when there is no start step', () => {
    expect(describeTrigger(undefined)).toMatch(/no Start step/i);
  });
});

describe('describeStep', () => {
  it('quotes the opening of a message rather than naming the node type', () => {
    expect(describeStep(step('message', { message: 'Hi! Welcome to Fitness First, how can we help today?' })))
      .toMatch(/^sends “Hi! Welcome to Fitness First,/);
  });

  it('mentions where a question stores its answer', () => {
    expect(describeStep(step('question', { message: 'What is your name?', saveAsVariable: 'name' })))
      .toMatch(/saves the answer as name/);
  });

  it('spells out a wait in the author’s own units', () => {
    expect(describeStep(step('wait', { mode: 'duration', days: 1, hours: 2 }))).toBe('waits 1 day 2 hours');
    expect(describeStep(step('wait', { mode: 'time', atTime: '10:00', weekday: 1 }))).toMatch(/next Monday at 10:00/);
  });

  it('lists what an action actually does, without repeating itself', () => {
    expect(describeStep(step('action', {
      operations: [{ type: 'add_tags' }, { type: 'add_tags' }, { type: 'assign' }],
    }))).toBe('tags the contact and assigns it to someone');
  });

  it('says an empty action does nothing yet', () => {
    expect(describeStep(step('action', { operations: [] }))).toMatch(/nothing yet/);
  });
});

describe('describeFlow', () => {
  it('reads a straight flow as one sentence', () => {
    const nodes = [
      node('s', 'start', { triggerType: 'keyword', triggerValue: 'Know More' }),
      node('m', 'message', { message: 'Welcome to Fitness First!' }),
      node('q', 'question', { message: 'May I know your name?', saveAsVariable: 'name' }),
      node('h', 'assign_agent', { message: 'Connecting you…' }),
    ];
    const text = describeFlow(nodes, [edge('s', 'm'), edge('m', 'q'), edge('q', 'h')]);
    expect(text).toMatch(/^When a message contains “Know More”, the bot sends/);
    expect(text).toMatch(/then hands the conversation to a person\.$/);
  });

  // The whole point: a flow whose steps are in the wrong order should read
  // obviously wrong, which is faster than spotting it on a canvas.
  it('reads backwards when the flow is backwards', () => {
    const nodes = [
      node('s', 'start', { triggerType: 'keyword', triggerValue: 'Hi' }),
      node('thanks', 'message', { message: 'Thank you, {{name}}!' }),
      node('ask', 'question', { message: 'What is your name?', saveAsVariable: 'name' }),
    ];
    const text = describeFlow(nodes, [edge('s', 'thanks'), edge('thanks', 'ask')]);
    expect(text.indexOf('Thank you')).toBeLessThan(text.indexOf('What is your name'));
  });

  it('says nothing happens when there are no steps', () => {
    expect(describeFlow([node('s', 'start', { triggerValue: 'Hi' })], []))
      .toMatch(/nothing happens yet/i);
  });

  // Flattening a branch into one sentence would describe a flow that does not
  // exist, so it counts the steps and says where to look instead.
  it('refuses to flatten a branching flow', () => {
    const nodes = [
      node('s', 'start', { triggerValue: 'Hi' }),
      node('c', 'condition'),
      node('y', 'message', { message: 'Yes path' }),
      node('n', 'message', { message: 'No path' }),
    ];
    const text = describeFlow(nodes, [edge('s', 'c'), edge('c', 'y', 'yes'), edge('c', 'n', 'no')]);
    expect(text).toMatch(/branches/i);
    expect(text).toMatch(/3 steps/);
    expect(text).not.toContain('Yes path');
  });

  it('handles a flow with no start step without throwing', () => {
    expect(describeFlow([node('m', 'message', { message: 'orphan' })], []))
      .toMatch(/no Start step/i);
  });
});

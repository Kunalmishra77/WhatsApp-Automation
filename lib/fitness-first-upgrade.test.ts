import { describe, it, expect } from 'vitest';
import { validateFlow } from './flow-validate';
import { simulateFlow } from './flow-simulator';
import { describeFlow } from './flow-summary';
import type { FlowNode, FlowEdge } from '@/modules/flows/types';

// Fitness First's "Welcome Message" flow, as migration 133 will leave it.
//
// This is a live client's flow, so the shape it will have is built here and put
// through the validator and the simulator before the migration is written —
// the same checks the editor would run, done in advance rather than after a
// client notices.
//
// The two questions becoming Collect steps are the ones with real evidence
// against them: a session in production holds day_text = "Okay i will visit",
// which is what the flow asked for a day and got.

const node = (id: string, type: string, data: Record<string, unknown>): FlowNode =>
  ({ id, type, data, position: { x: 0, y: 0 } } as unknown as FlowNode);
const edge = (source: string, target: string, sourceHandle?: string): FlowEdge =>
  ({ id: `e-${source}-${target}-${sourceHandle ?? ''}`, source, target, sourceHandle } as unknown as FlowEdge);

const NODES: FlowNode[] = [
  node('start-tpl-1', 'start', { label: 'Know More', triggerType: 'keyword', triggerValue: 'Know More' }),
  node('message-tpl-1', 'question', {
    label: 'Ready?', timeoutHours: 48,
    message: 'Hi! 👋 Welcome to Fitness First! 🏋️\n🪔 This Diwali, Gift Yourself a Fitter & Healthier Lifestyle!\n\n\nAre you ready to explore the offer? \n😊\n\nReply : Yes if your Interested',
  }),
  node('condition-1793174520125', 'condition', { label: 'Interested?', keyword: 'yes', matchType: 'contains' }),
  node('message-1793174541488', 'message', {
    label: 'Offer',
    message: "Amazing! 🎉 Here's your Diwali Special Offer!\n\n🔥 FLAT 30% OFF\n🎁 Get 12 + 3 Months Membership\n💰 Advertised Price: ₹3,333/Month\n\n",
  }),
  node('message-1793174550077', 'message', {
    label: 'Not now',
    message: 'No worries! 😊 Thank you for your time.\n\nWishing you a  Advance Happy Diwali! 🪔',
  }),
  node('message-1793174673597', 'question', {
    label: 'Ask name', message: '😊 May I know your name, please?', saveAsVariable: 'name', timeoutHours: 48,
  }),
  // Was a plain question. A plain question kept whatever arrived.
  node('message-1793174900605', 'collect', {
    label: 'Ask day', expects: 'date', saveAsVariable: 'day', maxAttempts: 2, timeoutHours: 48,
    message: '{{name}}!\n Which day would you like to visit Fitness First Gym?',
    retryMessage: 'Sorry, main samajh nahi paaya 😊 Kis din aana chahenge? Jaise: kal, Monday, ya 5 November.',
  }),
  node('message-1793174747893', 'collect', {
    label: 'Ask time', expects: 'time', saveAsVariable: 'time', maxAttempts: 2, timeoutHours: 48,
    message: 'Great, What time would be convenient for your gym visit?',
    retryMessage: 'Sorry, time samajh nahi aaya 😊 Jaise: 10am, 6 baje, ya evening.',
  }),
  node('message-1793174866061', 'message', {
    label: 'Confirm',
    message: 'Thank You, {{name}}! 🎉\n\nYour Fitness First gym visit is confirmed for {{day}} at {{time}}.',
  }),
  // New: somewhere for the two Collect steps to give up to.
  node('handoff-collect-1', 'assign_agent', {
    label: 'Hand to the team',
    message: 'Koi baat nahi 😊 Humari team aapko call karke visit ka time set kar degi. Dhanyavaad!',
  }),
  node('end-tpl-1', 'end', { label: 'End', message: '' }),
];

const EDGES: FlowEdge[] = [
  edge('start-tpl-1', 'message-tpl-1'),
  edge('message-tpl-1', 'condition-1793174520125'),
  edge('condition-1793174520125', 'message-1793174541488', 'yes'),
  edge('condition-1793174520125', 'message-1793174550077', 'no'),
  edge('message-1793174541488', 'message-1793174673597'),
  edge('message-1793174673597', 'message-1793174900605'),
  edge('message-1793174900605', 'message-1793174747893'),
  edge('message-1793174747893', 'message-1793174866061'),
  edge('message-1793174866061', 'end-tpl-1'),
  // The give-up branches, and an ending for the "not interested" side, which
  // was a dead end before.
  edge('message-1793174900605', 'handoff-collect-1', 'gave_up'),
  edge('message-1793174747893', 'handoff-collect-1', 'gave_up'),
  edge('message-1793174550077', 'end-tpl-1'),
];

describe('Fitness First — Welcome Message, after the upgrade', () => {
  it('passes the editor’s own validation', () => {
    expect(validateFlow(NODES, EDGES).map((w) => `${w.kind} @ ${w.nodeId}: ${w.message}`)).toEqual([]);
  });

  it('reads as a sentence', () => {
    expect(describeFlow(NODES, EDGES)).toMatch(/^When a message contains “Know More”/);
  });

  it('walks a good booking through to the confirmation', async () => {
    const turns = await simulateFlow(NODES, EDGES, ['Yes', 'Pooja', 'Monday', '10am']);
    const said = turns.flatMap((t) => t.events).filter((e) => e.kind === 'text').map((e) => (e as { body: string }).body);
    expect(said.some((t) => t.includes('Diwali Special Offer'))).toBe(true);
    expect(said.some((t) => t.includes('Your Fitness First gym visit is confirmed for Monday at 10am'))).toBe(true);
  });

  // The reason for the change: this exact answer is sitting in a live session,
  // saved as the day.
  it('refuses “Okay i will visit” as a day and asks again', async () => {
    const turns = await simulateFlow(NODES, EDGES, ['Yes', 'Pooja', 'Okay i will visit']);
    const last = turns[turns.length - 1]!;
    const said = last.events.filter((e) => e.kind === 'text').map((e) => (e as { body: string }).body);
    expect(said[0]).toMatch(/Kis din aana chahenge/);
    // The bad answer is not kept.
    expect(last.vars['day_text']).toBeUndefined();
    expect(last.waitingAt).toBe('message-1793174900605');
  });

  it('hands over to a person rather than asking a third time', async () => {
    const turns = await simulateFlow(NODES, EDGES, ['Yes', 'Pooja', 'ok', 'sure', 'haan']);
    const events = turns.flatMap((t) => t.events);
    expect(events.some((e) => e.kind === 'handoff')).toBe(true);
    const said = events.filter((e) => e.kind === 'text').map((e) => (e as { body: string }).body);
    expect(said.some((t) => t.includes('Humari team aapko call'))).toBe(true);
  });

  it('still accepts the ordinary ways a person writes a day and a time', async () => {
    for (const [day, time] of [['kal', '6 baje'], ['5 Nov', 'evening'], ['tomorrow', '10:30']]) {
      const turns = await simulateFlow(NODES, EDGES, ['Yes', 'Pooja', day!, time!]);
      const said = turns.flatMap((t) => t.events).filter((e) => e.kind === 'text').map((e) => (e as { body: string }).body);
      expect(said.some((t) => t.includes('is confirmed for')), `${day} / ${time}`).toBe(true);
    }
  });
});

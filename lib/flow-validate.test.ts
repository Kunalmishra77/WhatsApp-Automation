import { describe, it, expect } from 'vitest';
import { validateFlow, type ValidatableNode, type ValidatableEdge } from './flow-validate';

const n = (id: string, type: string, data: Record<string, unknown> = {}): ValidatableNode =>
  ({ id, type, data });
const e = (source: string, target: string): ValidatableEdge => ({ source, target });

const kinds = (nodes: ValidatableNode[], edges: ValidatableEdge[]) =>
  validateFlow(nodes, edges).map((w) => `${w.kind}:${w.nodeId}`);

describe('validateFlow — condition without a question', () => {
  // This is the Fitness First flow as it was saved: every node a `message`, so
  // the yes/no condition judged the trigger keyword and always branched the same
  // way. The editor accepted it silently.
  it('flags a condition reached through messages only', () => {
    const nodes = [n('s', 'start'), n('m', 'message', { message: 'Diwali offer! Interested?' }), n('c', 'condition')];
    const edges = [e('s', 'm'), e('m', 'c')];
    expect(kinds(nodes, edges)).toEqual(['condition_without_question:c']);
  });

  it('stays quiet once a question collects the answer', () => {
    const nodes = [n('s', 'start'), n('q', 'question', { message: 'Interested?' }), n('c', 'condition')];
    expect(kinds(nodes, [e('s', 'q'), e('q', 'c')])).toEqual([]);
  });

  // A question anywhere upstream is not enough: the branch that skips it still
  // arrives at the condition with nothing collected.
  it('flags a condition when only one path asks', () => {
    const nodes = [
      n('s', 'start'),
      n('q', 'question', { message: 'Interested?' }),
      n('skip', 'message', { message: 'Here is the offer.' }),
      n('c', 'condition'),
    ];
    const edges = [e('s', 'q'), e('q', 'c'), e('s', 'skip'), e('skip', 'c')];
    expect(kinds(nodes, edges)).toEqual(['condition_without_question:c']);
  });

  it('reports each bad condition once, not once per path', () => {
    const nodes = [n('s', 'start'), n('a', 'message'), n('b', 'message'), n('c', 'condition')];
    const edges = [e('s', 'a'), e('s', 'b'), e('a', 'c'), e('b', 'c')];
    expect(kinds(nodes, edges)).toEqual(['condition_without_question:c']);
  });

  // A loop back to a menu is a normal flow shape; the walk must terminate.
  it('terminates on a cycle', () => {
    const nodes = [n('s', 'start'), n('menu', 'question', { message: 'Pick one' }), n('c', 'condition')];
    const edges = [e('s', 'menu'), e('menu', 'c'), e('c', 'menu')];
    expect(kinds(nodes, edges)).toEqual([]);
  });

  // Nodes left unwired in the canvas never run, so they are not warned about.
  it('ignores a condition the start node cannot reach', () => {
    const nodes = [n('s', 'start'), n('orphan', 'condition')];
    expect(kinds(nodes, [])).toEqual([]);
  });
});

describe('validateFlow — placeholders nothing fills', () => {
  // "Thank You, {{name}}!" went out as "Thank You, !" for weeks.
  it('flags a variable no question saves', () => {
    const nodes = [
      n('s', 'start'),
      n('q', 'question', { message: 'May I know your name?' }),
      n('m', 'message', { message: 'Thank You, {{name}}!' }),
    ];
    const w = validateFlow(nodes, [e('s', 'q'), e('q', 'm')]);
    expect(w.map((x) => x.kind)).toEqual(['unsaved_variable']);
    expect(w[0]!.message).toContain('{{name}}');
  });

  it('stays quiet when the question saves it', () => {
    const nodes = [
      n('s', 'start'),
      n('q', 'question', { message: 'May I know your name?', saveAsVariable: 'name' }),
      n('m', 'message', { message: 'Thank You, {{name}}!' }),
    ];
    expect(kinds(nodes, [e('s', 'q'), e('q', 'm')])).toEqual([]);
  });

  // The engine interpolates {{ name }} with spaces too, so the check must agree.
  it('matches padded placeholders', () => {
    const nodes = [
      n('q', 'question', { message: 'Name?', saveAsVariable: 'name' }),
      n('m', 'message', { message: 'Hi {{ name }}' }),
    ];
    expect(kinds(nodes, [])).toEqual([]);
  });

  it('names every missing variable once per node', () => {
    const nodes = [
      n('q', 'question', { message: 'Day?', saveAsVariable: 'day' }),
      n('m', 'message', { message: '{{day}} at {{time}} for {{name}} — see you {{time}}!' }),
    ];
    const w = validateFlow(nodes, []);
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toContain('{{time}}, {{name}}');
  });

  // A blank "Save answer as" field is the same as not setting one.
  it('does not count a whitespace-only saveAsVariable', () => {
    const nodes = [
      n('q', 'question', { message: 'Name?', saveAsVariable: '   ' }),
      n('m', 'message', { message: 'Hi {{name}}' }),
    ];
    expect(kinds(nodes, [])).toEqual(['unsaved_variable:m']);
  });

  // Only a question parks the session to collect a reply, so a message node's
  // saveAsVariable captures nothing and must not silence the warning.
  it('ignores saveAsVariable on a non-question node', () => {
    const nodes = [
      n('m1', 'message', { message: 'Your name?', saveAsVariable: 'name' }),
      n('m2', 'message', { message: 'Hi {{name}}' }),
    ];
    expect(kinds(nodes, [])).toEqual(['unsaved_variable:m2']);
  });
});

describe('validateFlow — shape', () => {
  it('returns nothing for an empty canvas', () => {
    expect(validateFlow([], [])).toEqual([]);
  });

  it('returns nothing for the flow as migration 122 left it', () => {
    const nodes = [
      n('s', 'start'),
      n('tpl', 'question', { message: 'Diwali offer! Interested?', timeoutHours: 48 }),
      n('c', 'condition'),
      n('ask-name', 'question', { message: 'May I know your name?', saveAsVariable: 'name' }),
      n('ask-day', 'question', { message: 'Which day?', saveAsVariable: 'day' }),
      n('ask-time', 'question', { message: 'What time?', saveAsVariable: 'time' }),
      n('confirm', 'message', { message: 'Thanks {{name}}, see you {{day}} at {{time}}.' }),
      n('bye', 'message', { message: 'No problem — have a great day!' }),
      n('end', 'end'),
    ];
    const edges = [
      e('s', 'tpl'), e('tpl', 'c'), e('c', 'ask-name'), e('c', 'bye'),
      e('ask-name', 'ask-day'), e('ask-day', 'ask-time'), e('ask-time', 'confirm'),
      e('confirm', 'end'), e('bye', 'end'),
    ];
    expect(validateFlow(nodes, edges)).toEqual([]);
  });

  it('survives nodes with no data at all', () => {
    const nodes: ValidatableNode[] = [{ id: 's', type: 'start' }, { id: 'm', type: 'message' }];
    expect(validateFlow(nodes, [e('s', 'm')])).toEqual([]);
  });
});

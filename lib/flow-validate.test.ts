import { describe, it, expect } from 'vitest';
import { validateFlow, type ValidatableNode, type ValidatableEdge } from './flow-validate';

const n = (id: string, type: string, data: Record<string, unknown> = {}): ValidatableNode =>
  ({ id, type, data });
const e = (source: string, target: string, _sourceHandle?: string): ValidatableEdge =>
  ({ source, target });

// Each test asserts about the one check it is for. Matching the whole list
// made every one of these fail the moment another check was added.
const kinds = (nodes: ValidatableNode[], edges: ValidatableEdge[], only?: string) =>
  validateFlow(nodes, edges)
    .filter((w) => !only || w.kind === only)
    .map((w) => `${w.kind}:${w.nodeId}`);

describe('validateFlow — condition without a question', () => {
  // This is the Fitness First flow as it was saved: every node a `message`, so
  // the yes/no condition judged the trigger keyword and always branched the same
  // way. The editor accepted it silently.
  it('flags a condition reached through messages only', () => {
    const nodes = [n('s', 'start'), n('m', 'message', { message: 'Diwali offer! Interested?' }), n('c', 'condition')];
    const edges = [e('s', 'm'), e('m', 'c')];
    expect(kinds(nodes, edges, 'condition_without_question')).toEqual(['condition_without_question:c']);
  });

  it('stays quiet once a question collects the answer', () => {
    const nodes = [n('s', 'start'), n('q', 'question', { message: 'Interested?' }), n('c', 'condition')];
    expect(kinds(nodes, [e('s', 'q'), e('q', 'c')], 'condition_without_question')).toEqual([]);
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
    expect(kinds(nodes, edges, 'condition_without_question')).toEqual(['condition_without_question:c']);
  });

  it('reports each bad condition once, not once per path', () => {
    const nodes = [n('s', 'start'), n('a', 'message'), n('b', 'message'), n('c', 'condition')];
    const edges = [e('s', 'a'), e('s', 'b'), e('a', 'c'), e('b', 'c')];
    expect(kinds(nodes, edges, 'condition_without_question')).toEqual(['condition_without_question:c']);
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
    expect(kinds(nodes, [], 'condition_without_question')).toEqual([]);
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
    const w = validateFlow(nodes, [e('s', 'q'), e('q', 'm')]).filter((x) => x.kind === 'unsaved_variable');
    expect(w.map((x) => x.kind)).toEqual(['unsaved_variable']);
    expect(w[0]!.message).toContain('{{name}}');
  });

  it('stays quiet when the question saves it', () => {
    const nodes = [
      n('s', 'start'),
      n('q', 'question', { message: 'May I know your name?', saveAsVariable: 'name' }),
      n('m', 'message', { message: 'Thank You, {{name}}!' }),
    ];
    expect(kinds(nodes, [e('s', 'q'), e('q', 'm')], 'unsaved_variable')).toEqual([]);
  });

  // The engine interpolates {{ name }} with spaces too, so the check must agree.
  it('matches padded placeholders', () => {
    const nodes = [
      n('q', 'question', { message: 'Name?', saveAsVariable: 'name' }),
      n('m', 'message', { message: 'Hi {{ name }}' }),
    ];
    expect(kinds(nodes, [], 'unsaved_variable')).toEqual([]);
  });

  it('names every missing variable once per node', () => {
    const nodes = [
      n('q', 'question', { message: 'Day?', saveAsVariable: 'day' }),
      n('m', 'message', { message: '{{day}} at {{time}} for {{name}} — see you {{time}}!' }),
    ];
    const w = validateFlow(nodes, []).filter((x) => x.kind === 'unsaved_variable');
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toContain('{{time}}, {{name}}');
  });

  // A blank "Save answer as" field is the same as not setting one.
  it('does not count a whitespace-only saveAsVariable', () => {
    const nodes = [
      n('q', 'question', { message: 'Name?', saveAsVariable: '   ' }),
      n('m', 'message', { message: 'Hi {{name}}' }),
    ];
    expect(kinds(nodes, [], 'unsaved_variable')).toEqual(['unsaved_variable:m']);
  });

  // Only a question parks the session to collect a reply, so a message node's
  // saveAsVariable captures nothing and must not silence the warning.
  it('ignores saveAsVariable on a non-question node', () => {
    const nodes = [
      n('m1', 'message', { message: 'Your name?', saveAsVariable: 'name' }),
      n('m2', 'message', { message: 'Hi {{name}}' }),
    ];
    expect(kinds(nodes, [], 'unsaved_variable')).toEqual(['unsaved_variable:m2']);
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

  // A node with no data at all is what a half-built flow looks like. The point
  // here is that nothing throws — it now has plenty to warn about.
  it('survives nodes with no data at all', () => {
    const nodes: ValidatableNode[] = [{ id: 's', type: 'start' }, { id: 'm', type: 'message' }];
    expect(() => validateFlow(nodes, [e('s', 'm')])).not.toThrow();
    expect(validateFlow(nodes, [e('s', 'm')].map((x) => x)).map((w) => w.kind).sort())
      .toEqual(['dead_end', 'empty_copy']);
  });
});

const kindsOf = (nodes: ValidatableNode[], edges: ValidatableEdge[]) =>
  validateFlow(nodes, edges).map((w) => w.kind);

describe('validateFlow — steps that can never run', () => {
  it('flags a node nothing leads to', () => {
    const nodes = [n('s', 'start'), n('m', 'message', { message: 'hi' }), n('lost', 'message', { message: 'written and forgotten' })];
    const w = validateFlow(nodes, [e('s', 'm')]);
    expect(w.filter((x) => x.kind === 'unreachable').map((x) => x.nodeId)).toEqual(['lost']);
  });

  it('does not call a reachable node unreachable', () => {
    const nodes = [n('s', 'start'), n('m', 'message', { message: 'hi' }), n('e2', 'end', { message: 'bye' })];
    expect(kindsOf(nodes, [e('s', 'm'), e('m', 'e2')])).not.toContain('unreachable');
  });
});

describe('validateFlow — a flow that stops mid-sentence', () => {
  it('flags a message with nothing after it', () => {
    const nodes = [n('s', 'start'), n('m', 'message', { message: 'hi' })];
    expect(kindsOf(nodes, [e('s', 'm')])).toContain('dead_end');
  });

  // Ending and handing over are both proper endings.
  it('accepts an end node and a handoff as the last step', () => {
    for (const type of ['end', 'assign_agent']) {
      const nodes = [n('s', 'start'), n('last', type, { message: 'bye' })];
      expect(kindsOf(nodes, [e('s', 'last')])).not.toContain('dead_end');
    }
  });
});

describe('validateFlow — steps with nothing in them', () => {
  it('flags a message with no copy', () => {
    const nodes = [n('s', 'start'), n('m', 'message', { message: '   ' }), n('e2', 'end', { message: 'bye' })];
    expect(kindsOf(nodes, [e('s', 'm'), e('m', 'e2')])).toContain('empty_copy');
  });

  it('flags a media step with no file', () => {
    const nodes = [n('s', 'start'), n('img', 'media', { kind: 'image', url: '' }), n('e2', 'end', { message: 'bye' })];
    expect(kindsOf(nodes, [e('s', 'img'), e('img', 'e2')])).toContain('media_without_file');
  });

  it('flags a location step with no place', () => {
    const nodes = [n('s', 'start'), n('loc', 'media', { kind: 'location' }), n('e2', 'end', { message: 'bye' })];
    expect(kindsOf(nodes, [e('s', 'loc'), e('loc', 'e2')])).toContain('media_without_file');
  });

  it('is quiet about a media step that has one', () => {
    const nodes = [n('s', 'start'), n('img', 'media', { kind: 'image', url: 'https://x/y.png' }), n('e2', 'end', { message: 'bye' })];
    expect(kindsOf(nodes, [e('s', 'img'), e('img', 'e2')])).not.toContain('media_without_file');
  });
});

describe('validateFlow — built-in variables', () => {
  it('accepts the ones the engine seeds', () => {
    const nodes = [n('s', 'start'), n('m', 'message', { message: 'Hi {{system.contact_name}}, today is {{system.date}}' }), n('e2', 'end', { message: 'bye' })];
    const k = kindsOf(nodes, [e('s', 'm'), e('m', 'e2')]);
    expect(k).not.toContain('unknown_system_variable');
    expect(k).not.toContain('unsaved_variable');
  });

  // The whole reason the pattern admits a dot: without it this typo was invisible.
  it('catches a misspelt built-in', () => {
    const nodes = [n('s', 'start'), n('m', 'message', { message: 'Hi {{system.contactname}}' }), n('e2', 'end', { message: 'bye' })];
    expect(kindsOf(nodes, [e('s', 'm'), e('m', 'e2')])).toContain('unknown_system_variable');
  });
});

describe('validateFlow — a variable used before it is asked for', () => {
  it('flags copy that reads an answer the flow has not collected yet', () => {
    const nodes = [
      n('s', 'start'),
      n('greet', 'message', { message: 'Hello {{name}}!' }),
      n('ask', 'question', { message: 'What is your name?', saveAsVariable: 'name' }),
      n('e2', 'end', { message: 'bye' }),
    ];
    const w = validateFlow(nodes, [e('s', 'greet'), e('greet', 'ask'), e('ask', 'e2')]);
    expect(w.filter((x) => x.kind === 'variable_used_too_early').map((x) => x.nodeId)).toEqual(['greet']);
    // It is saved somewhere, so the "nothing saves it" warning must not also fire.
    expect(w.map((x) => x.kind)).not.toContain('unsaved_variable');
  });

  it('is quiet when the question comes first', () => {
    const nodes = [
      n('s', 'start'),
      n('ask', 'question', { message: 'What is your name?', saveAsVariable: 'name' }),
      n('greet', 'message', { message: 'Hello {{name}}!' }),
      n('e2', 'end', { message: 'bye' }),
    ];
    expect(kindsOf(nodes, [e('s', 'ask'), e('ask', 'greet'), e('greet', 'e2')])).not.toContain('variable_used_too_early');
  });

  // Saved on one branch only: the other branch still arrives without it.
  it('flags a variable saved on only one route', () => {
    const nodes = [
      n('s', 'start'),
      n('c', 'condition'),
      n('ask', 'question', { message: 'Name?', saveAsVariable: 'name' }),
      n('skip', 'message', { message: 'Skipping ahead' }),
      n('greet', 'message', { message: 'Hello {{name}}!' }),
      n('e2', 'end', { message: 'bye' }),
    ];
    const edges = [
      e('s', 'c'), e('c', 'ask', 'yes'), e('c', 'skip', 'no'),
      e('ask', 'greet'), e('skip', 'greet'), e('greet', 'e2'),
    ];
    expect(kindsOf(nodes, edges)).toContain('variable_used_too_early');
  });
});

describe('validateFlow — waiting past the 24-hour window', () => {
  it('flags a two-day wait followed by a message', () => {
    const nodes = [
      n('s', 'start'),
      n('w', 'wait', { mode: 'duration', days: 2 }),
      n('m', 'message', { message: 'Still interested?' }),
      n('e2', 'end', { message: 'bye' }),
    ];
    expect(kindsOf(nodes, [e('s', 'w'), e('w', 'm'), e('m', 'e2')])).toContain('wait_past_the_window');
  });

  it('is quiet about a two-hour wait', () => {
    const nodes = [
      n('s', 'start'),
      n('w', 'wait', { mode: 'duration', hours: 2 }),
      n('m', 'message', { message: 'Still interested?' }),
      n('e2', 'end', { message: 'bye' }),
    ];
    expect(kindsOf(nodes, [e('s', 'w'), e('w', 'm'), e('m', 'e2')])).not.toContain('wait_past_the_window');
  });
});

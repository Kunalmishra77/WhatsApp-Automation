import { describe, it, expect } from 'vitest';
import { VERTICAL_TEMPLATES } from './flow-templates-verticals';
import { validateFlow } from './flow-validate';
import { toSteps } from './flow-steps';
import { describeFlow } from './flow-summary';
import { simulateFlow } from './flow-simulator';

// A template is a starting point a client sends as it stands. Anything wrong
// with one is wrong in every workspace that opens it, so each goes through the
// same checks the editor would run.

describe('every vertical template', () => {
  it.each(VERTICAL_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s passes the editor\'s own validation',
    (_name, tpl) => {
      const warnings = validateFlow(tpl.nodes, tpl.edges);
      // Failing here means we are shipping a starting point the editor would
      // immediately complain about.
      expect(warnings.map((w) => `${w.kind}: ${w.message}`)).toEqual([]);
    },
  );

  it.each(VERTICAL_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s opens in the step list, not only the canvas',
    (_name, tpl) => {
      const r = toSteps(tpl.nodes, tpl.edges);
      expect(r.ok ? 'listable' : r.reason).toBe('listable');
    },
  );

  it.each(VERTICAL_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s reads as a sentence',
    (_name, tpl) => {
      const text = describeFlow(tpl.nodes, tpl.edges);
      expect(text).toMatch(/^When someone says/);
      expect(text).not.toMatch(/never start/i);
    },
  );

  it.each(VERTICAL_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s runs end to end in the simulator',
    async (_name, tpl) => {
      // Enough replies to walk past every question in the longest template.
      const turns = await simulateFlow(tpl.nodes, tpl.edges, ['Yes', 'Amit', 'Monday', '10am', 'Patna']);
      expect(turns[0]!.events.length).toBeGreaterThan(0);
      // Nothing should report that it could not be run or led nowhere.
      const notes = turns.flatMap((t) => t.events).filter((e) => e.kind === 'note');
      expect(notes.filter((x) => !/ended/i.test((x as { text: string }).text))).toEqual([]);
    },
  );
});

describe('the set as a whole', () => {
  it('has a unique id per template', () => {
    const ids = VERTICAL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the verticals the live workspaces fall into', () => {
    const verticals = new Set(VERTICAL_TEMPLATES.map((t) => t.vertical));
    for (const expected of ['Gym & Fitness', 'Clinic & Hospital', 'Salon & Spa', 'Hotel & Resort', 'Software & Services']) {
      expect(verticals).toContain(expected);
    }
  });

  it('gives every template a trigger, so none of them is dead on arrival', () => {
    for (const t of VERTICAL_TEMPLATES) {
      expect(t.trigger_value ?? '').not.toBe('');
      expect(t.nodes.find((n) => n.type === 'start')).toBeDefined();
    }
  });

  // The point of putting newer steps inside templates is that clients find them
  // without being told they exist.
  it('shows off the steps a client would otherwise never notice', () => {
    const types = new Set(VERTICAL_TEMPLATES.flatMap((t) => t.nodes.map((n) => n.type)));
    expect(types).toContain('action');
    expect(types).toContain('wait');
    const hasChoices = VERTICAL_TEMPLATES.some((t) =>
      t.nodes.some((n) => ((n.data as { choices?: unknown[] })?.choices?.length ?? 0) > 0),
    );
    expect(hasChoices).toBe(true);
  });
});

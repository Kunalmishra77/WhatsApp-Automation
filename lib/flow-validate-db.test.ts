import { describe, it, expect } from 'vitest';
import {
  triggerConflictWarnings,
  templateReferenceWarnings,
  type SiblingFlow,
  type WorkspaceTemplate,
} from './flow-validate-db';

const flow = (over: Partial<SiblingFlow> & { id: string; name: string }): SiblingFlow => ({
  isActive: true,
  triggerType: 'keyword',
  triggerValue: null,
  priority: 0,
  createdAt: '2026-01-01',
  ...over,
});

describe('triggerConflictWarnings', () => {
  it('says nothing when a draft is saved, however it collides', () => {
    const self = flow({ id: 'a', name: 'Draft', isActive: false, triggerValue: 'Book Now' });
    const other = flow({ id: 'b', name: 'Live', triggerValue: 'Book Now' });
    expect(triggerConflictWarnings(self, [other], 'start-1')).toEqual([]);
  });

  it('says nothing when the triggers cannot collide', () => {
    const self = flow({ id: 'a', name: 'Mine', triggerValue: 'Know More' });
    const other = flow({ id: 'b', name: 'Theirs', triggerValue: 'Book Now' });
    expect(triggerConflictWarnings(self, [other], 'start-1')).toEqual([]);
  });

  // The real trap. Matching is `includes`, so the SHORTER keyword wins every
  // message that carries the longer one.
  it('catches a keyword hidden inside another, not just an exact duplicate', () => {
    const shorter = flow({ id: 'a', name: 'Booking', triggerValue: 'Book', createdAt: '2026-01-01' });
    const longer = flow({ id: 'b', name: 'Book A Slot', triggerValue: 'Book Now', createdAt: '2026-02-01' });

    const onLonger = triggerConflictWarnings(longer, [shorter], 'start-1');
    expect(onLonger.map((w) => w.kind)).toEqual(['trigger_never_fires']);
    expect(onLonger[0]!.message).toContain('"Booking"');

    // And the author of the shorter one is told what they are breaking.
    const onShorter = triggerConflictWarnings(shorter, [longer], 'start-1');
    expect(onShorter.map((w) => w.kind)).toEqual(['trigger_shadows_another']);
    expect(onShorter[0]!.message).toContain('"Book A Slot"');
  });

  it('is case- and whitespace-insensitive, as the engine is', () => {
    const first = flow({ id: 'a', name: 'First', triggerValue: '  BOOK  ', createdAt: '2026-01-01' });
    const second = flow({ id: 'b', name: 'Second', triggerValue: 'book now', createdAt: '2026-02-01' });
    expect(triggerConflictWarnings(second, [first], 'start-1').map((w) => w.kind))
      .toEqual(['trigger_never_fires']);
  });

  // Mirrors flow-engine.ts: priority DESC, created_at ASC. If these two ever
  // disagree the warning would name the wrong winner, which is worse than none.
  //
  // `chatbot_flows` has no priority column today, so the engine scores every
  // flow 0 and only age decides. This pins the behaviour for when it is added;
  // the test below covers what actually happens now.
  it('follows the engine order — priority first, then oldest', () => {
    const older = flow({ id: 'a', name: 'Older', triggerValue: 'Book', createdAt: '2026-01-01', priority: 0 });
    const newerHigher = flow({ id: 'b', name: 'Newer', triggerValue: 'Book', createdAt: '2026-02-01', priority: 5 });

    // Priority beats age: the newer one wins, so the older one is the victim.
    expect(triggerConflictWarnings(older, [newerHigher], 'start-1').map((w) => w.kind))
      .toEqual(['trigger_never_fires']);
    expect(triggerConflictWarnings(newerHigher, [older], 'start-1').map((w) => w.kind))
      .toEqual(['trigger_shadows_another']);
  });

  it('treats a missing priority as 0, the way the engine does', () => {
    const noPriority = flow({ id: 'a', name: 'Legacy', triggerValue: 'Book', createdAt: '2026-01-01' });
    delete (noPriority as { priority?: number | null }).priority;
    const explicit = flow({ id: 'b', name: 'New', triggerValue: 'Book', createdAt: '2026-02-01', priority: 0 });
    expect(triggerConflictWarnings(explicit, [noPriority], 'start-1').map((w) => w.kind))
      .toEqual(['trigger_never_fires']);
  });

  it('flags a second first_message flow, which can never run', () => {
    const first = flow({ id: 'a', name: 'Welcome', triggerType: 'first_message', createdAt: '2026-01-01' });
    const second = flow({ id: 'b', name: 'Also Welcome', triggerType: 'first_message', createdAt: '2026-02-01' });
    const w = triggerConflictWarnings(second, [first], 'start-1');
    expect(w.map((x) => x.kind)).toEqual(['trigger_never_fires']);
    expect(w[0]!.message).toContain('the first message from a contact');
  });

  // A first_message flow only owns the first message; keyword flows still fire
  // on every one after it. Claiming otherwise would be a false warning.
  it('does not claim first_message hides a keyword flow', () => {
    const welcome = flow({ id: 'a', name: 'Welcome', triggerType: 'first_message', createdAt: '2026-01-01' });
    const kw = flow({ id: 'b', name: 'Booking', triggerValue: 'Book', createdAt: '2026-02-01' });
    expect(triggerConflictWarnings(kw, [welcome], 'start-1')).toEqual([]);
    expect(triggerConflictWarnings(welcome, [kw], 'start-1')).toEqual([]);
  });

  it('ignores an empty keyword, which the engine never matches on', () => {
    const empty = flow({ id: 'a', name: 'Unset', triggerValue: '', createdAt: '2026-01-01' });
    const real = flow({ id: 'b', name: 'Real', triggerValue: 'Book', createdAt: '2026-02-01' });
    expect(triggerConflictWarnings(real, [empty], 'start-1')).toEqual([]);
    expect(triggerConflictWarnings(empty, [real], 'start-1')).toEqual([]);
  });

  it('ignores the workspace’s inactive flows', () => {
    const self = flow({ id: 'a', name: 'Mine', triggerValue: 'Book Now', createdAt: '2026-02-01' });
    const draft = flow({ id: 'b', name: 'Draft', triggerValue: 'Book', isActive: false, createdAt: '2026-01-01' });
    expect(triggerConflictWarnings(self, [draft], 'start-1')).toEqual([]);
  });

  it('does not report a flow against itself when it appears in the list', () => {
    const self = flow({ id: 'a', name: 'Mine', triggerValue: 'Book' });
    expect(triggerConflictWarnings(self, [self], 'start-1')).toEqual([]);
  });

  it('anchors the warning to the start node, where the trigger lives', () => {
    const first = flow({ id: 'a', name: 'First', triggerValue: 'Book', createdAt: '2026-01-01' });
    const second = flow({ id: 'b', name: 'Second', triggerValue: 'Book', createdAt: '2026-02-01' });
    expect(triggerConflictWarnings(second, [first], 'start-xyz')[0]!.nodeId).toBe('start-xyz');
  });

  // Razorveda runs four active flows at once; none of their keywords contains
  // another, which is why nothing warns today.
  it('stays quiet on the live Razorveda set', () => {
    const live: SiblingFlow[] = [
      flow({ id: '1', name: 'Lead Qualifier', triggerValue: 'Book Free Consultation', createdAt: '2026-07-07' }),
      flow({ id: '2', name: 'Welcome Message', triggerValue: 'Talk to Expert', createdAt: '2026-09-07' }),
      flow({ id: '3', name: 'Welcome Message', triggerValue: 'Hi, I need more info about Mamo Plus', createdAt: '2026-10-13' }),
      flow({ id: '4', name: 'Mamo Firm Nurture Flow', triggerValue: 'Hi, I am interested in Mamo Firm.', createdAt: '2026-10-15' }),
    ];
    for (const self of live) {
      expect(triggerConflictWarnings(self, live, 'start-1')).toEqual([]);
    }
  });
});

const tpl = (over: Partial<WorkspaceTemplate> & { name: string }): WorkspaceTemplate => ({
  language: 'en',
  status: 'approved',
  ...over,
});

describe('templateReferenceWarnings', () => {
  const node = (data: unknown, id = 'tpl-1') => ({ id, type: 'template', data });

  it('says nothing when the template is approved in the right language', () => {
    expect(templateReferenceWarnings(
      [node({ templateName: 'offer_reminder', language: 'en' })],
      [tpl({ name: 'offer_reminder' })],
    )).toEqual([]);
  });

  it('flags a template the workspace no longer has', () => {
    const w = templateReferenceWarnings(
      [node({ templateName: 'deleted_in_meta' })],
      [tpl({ name: 'offer_reminder' })],
    );
    expect(w.map((x) => x.kind)).toEqual(['template_missing']);
    expect(w[0]!.nodeId).toBe('tpl-1');
  });

  // A template is approved per language, so the name existing is not enough.
  it('flags the right name in the wrong language, and says which it has', () => {
    const w = templateReferenceWarnings(
      [node({ templateName: 'offer_reminder', language: 'hi' })],
      [tpl({ name: 'offer_reminder', language: 'en' }), tpl({ name: 'offer_reminder', language: 'en_US' })],
    );
    expect(w.map((x) => x.kind)).toEqual(['template_missing']);
    expect(w[0]!.message).toContain('en, en_US');
  });

  it('flags a template still waiting on Meta', () => {
    const w = templateReferenceWarnings(
      [node({ templateName: 'offer_reminder' })],
      [tpl({ name: 'offer_reminder', status: 'pending' })],
    );
    expect(w.map((x) => x.kind)).toEqual(['template_not_approved']);
    expect(w[0]!.message).toContain('pending');
  });

  // One approved row is enough, even beside a rejected duplicate.
  it('accepts an approved row alongside a rejected one', () => {
    expect(templateReferenceWarnings(
      [node({ templateName: 'offer_reminder' })],
      [tpl({ name: 'offer_reminder', status: 'rejected' }), tpl({ name: 'offer_reminder' })],
    )).toEqual([]);
  });

  it('defaults a node with no language to en, as the handler does', () => {
    expect(templateReferenceWarnings(
      [node({ templateName: 'offer_reminder' })],
      [tpl({ name: 'offer_reminder', language: 'en' })],
    )).toEqual([]);
  });

  it('treats a template row with no language as en', () => {
    expect(templateReferenceWarnings(
      [node({ templateName: 'offer_reminder', language: 'en' })],
      [tpl({ name: 'offer_reminder', language: null })],
    )).toEqual([]);
  });

  // The pure validator already says template_not_chosen; repeating it here
  // would train the author to skim the list.
  it('leaves a node with nothing chosen to the pure validator', () => {
    expect(templateReferenceWarnings([node({}), node({ templateName: '   ' }, 'tpl-2')], [])).toEqual([]);
  });

  it('ignores every node that is not a template step', () => {
    expect(templateReferenceWarnings(
      [{ id: 'm1', type: 'message', data: { templateName: 'offer_reminder' } }],
      [],
    )).toEqual([]);
  });

  it('reports each bad template node separately', () => {
    const w = templateReferenceWarnings(
      [node({ templateName: 'gone_a' }, 'a'), node({ templateName: 'gone_b' }, 'b')],
      [],
    );
    expect(w.map((x) => x.nodeId)).toEqual(['a', 'b']);
  });
});

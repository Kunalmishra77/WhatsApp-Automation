import { describe, it, expect } from 'vitest';
import {
  matchTrigger, triggerFires, triggerOrder, isWithinWindow,
  describeTriggerType, needsAdId,
  type TriggerCandidate, type TriggerSignal,
} from './flow-triggers';

const flow = (over: Partial<TriggerCandidate> & { id: string }): TriggerCandidate => ({
  name: over.id,
  triggerType: 'keyword',
  triggerValue: null,
  priority: 0,
  createdAt: '2026-01-01',
  activeWindow: null,
  ...over,
});

const signal = (over: Partial<TriggerSignal> = {}): TriggerSignal => ({
  message: '',
  isFirstContactMessage: false,
  ...over,
});

// 2026-11-02 is a Monday. IST is UTC+05:30, so 04:30 UTC is 10:00 IST.
const istMonday = (hhmm: string): Date => {
  const [h, m] = hhmm.split(':').map(Number);
  const utcMinutes = h! * 60 + m! - 330;
  return new Date(Date.UTC(2026, 10, 2, 0, 0, 0) + utcMinutes * 60_000);
};

describe('triggerFires', () => {
  it('fires first_message only on a first message', () => {
    const f = flow({ id: 'a', triggerType: 'first_message' });
    expect(triggerFires(f, signal({ isFirstContactMessage: true }))).toBe(true);
    expect(triggerFires(f, signal({ isFirstContactMessage: false }))).toBe(false);
  });

  // `includes`, not equality — unchanged behaviour, and the reason the editor
  // warns when one keyword hides inside another.
  it('matches a keyword anywhere in the message, case-insensitively', () => {
    const f = flow({ id: 'a', triggerType: 'keyword', triggerValue: 'Book Now' });
    expect(triggerFires(f, signal({ message: 'hi, BOOK NOW please' }))).toBe(true);
    expect(triggerFires(f, signal({ message: 'book' }))).toBe(false);
  });

  it('never fires a keyword with nothing set', () => {
    const f = flow({ id: 'a', triggerType: 'keyword', triggerValue: '  ' });
    expect(triggerFires(f, signal({ message: 'anything' }))).toBe(false);
  });

  // The message text of a tap is a display label like `[Tapped button: "..."]`,
  // so the id and title are the only things worth matching.
  it('matches a tapped button by id, and by title', () => {
    const byId = flow({ id: 'a', triggerType: 'button', triggerValue: 'book_slot' });
    expect(triggerFires(byId, signal({ choice: { id: 'book_slot', title: 'Book a slot' } }))).toBe(true);

    const byTitle = flow({ id: 'b', triggerType: 'button', triggerValue: 'Book a slot' });
    expect(triggerFires(byTitle, signal({ choice: { id: 'o4f2', title: 'Book a slot' } }))).toBe(true);
  });

  it('does not fire a button trigger on a typed message', () => {
    const f = flow({ id: 'a', triggerType: 'button', triggerValue: 'book_slot' });
    expect(triggerFires(f, signal({ message: 'book_slot' }))).toBe(false);
  });

  it('fires a button trigger with no value on any tap', () => {
    const f = flow({ id: 'a', triggerType: 'button', triggerValue: '' });
    expect(triggerFires(f, signal({ choice: { id: 'anything' } }))).toBe(true);
    expect(triggerFires(f, signal({ message: 'typed' }))).toBe(false);
  });

  it('fires ad_click for any ad when no ad id is set', () => {
    const any = flow({ id: 'a', triggerType: 'ad_click', triggerValue: '' });
    expect(triggerFires(any, signal({ adId: '120211' }))).toBe(true);
    expect(triggerFires(any, signal({ adId: null }))).toBe(false);

    const one = flow({ id: 'b', triggerType: 'ad_click', triggerValue: '120211' });
    expect(triggerFires(one, signal({ adId: '120211' }))).toBe(true);
    expect(triggerFires(one, signal({ adId: '999' }))).toBe(false);
  });

  it('fires campaign_reply only on a campaign reply', () => {
    const any = flow({ id: 'a', triggerType: 'campaign_reply', triggerValue: '' });
    expect(triggerFires(any, signal({ campaignId: 'c1' }))).toBe(true);
    expect(triggerFires(any, signal({ campaignId: null }))).toBe(false);

    const one = flow({ id: 'b', triggerType: 'campaign_reply', triggerValue: 'c1' });
    expect(triggerFires(one, signal({ campaignId: 'c2' }))).toBe(false);
  });

  it('fires any_message on anything', () => {
    const f = flow({ id: 'a', triggerType: 'any_message' });
    expect(triggerFires(f, signal({ message: '' }))).toBe(true);
  });

  // Otherwise a manual flow would fire for everyone the moment it was switched
  // on, which is the opposite of what "manual" means.
  it('never fires a manual trigger from a message', () => {
    const f = flow({ id: 'a', triggerType: 'manual' });
    expect(triggerFires(f, signal({ message: 'hello', isFirstContactMessage: true }))).toBe(false);
  });

  it('does not fire a trigger type it does not know', () => {
    const f = flow({ id: 'a', triggerType: 'lead_created' });
    expect(triggerFires(f, signal({ message: 'anything' }))).toBe(false);
  });
});

describe('isWithinWindow', () => {
  it('is always inside when there is no window', () => {
    expect(isWithinWindow(null, istMonday('03:00'))).toBe(true);
    expect(isWithinWindow(undefined, istMonday('03:00'))).toBe(true);
  });

  it('honours a daytime window, from inclusive and to exclusive', () => {
    const w = { from: '09:00', to: '18:00' };
    expect(isWithinWindow(w, istMonday('09:00'))).toBe(true);
    expect(isWithinWindow(w, istMonday('17:59'))).toBe(true);
    expect(isWithinWindow(w, istMonday('18:00'))).toBe(false);
    expect(isWithinWindow(w, istMonday('08:59'))).toBe(false);
  });

  // The whole point: an after-hours flow and a working-hours flow sharing a
  // trigger must cover the day exactly once between them.
  it('lets two windows meeting at 18:00 cover the day exactly once', () => {
    const day = { from: '09:00', to: '18:00' };
    const night = { from: '18:00', to: '09:00' };
    for (const t of ['09:00', '12:00', '17:59', '18:00', '23:00', '02:00', '08:59']) {
      const inDay = isWithinWindow(day, istMonday(t));
      const inNight = isWithinWindow(night, istMonday(t));
      expect(inDay !== inNight, `${t} is in ${inDay ? 'day' : ''}${inNight ? 'night' : ''}`).toBe(true);
    }
  });

  it('handles an overnight window', () => {
    const w = { from: '22:00', to: '06:00' };
    expect(isWithinWindow(w, istMonday('22:00'))).toBe(true);
    expect(isWithinWindow(w, istMonday('23:59'))).toBe(true);
    expect(isWithinWindow(w, istMonday('05:59'))).toBe(true);
    expect(isWithinWindow(w, istMonday('06:00'))).toBe(false);
    expect(isWithinWindow(w, istMonday('12:00'))).toBe(false);
  });

  it('restricts to the chosen weekdays', () => {
    // Monday = 1.
    expect(isWithinWindow({ days: [1] }, istMonday('12:00'))).toBe(true);
    expect(isWithinWindow({ days: [2, 3] }, istMonday('12:00'))).toBe(false);
    expect(isWithinWindow({ days: [] }, istMonday('12:00'))).toBe(true);
  });

  // "Closed on Sunday" must not cut a Saturday night flow off at midnight, so
  // an overnight window belongs to the day it starts on.
  it('treats an overnight window as belonging to the day it starts on', () => {
    const satNight = { days: [6], from: '22:00', to: '06:00' };
    // Monday 02:00 belongs to Sunday's window, which is not listed.
    expect(isWithinWindow(satNight, istMonday('02:00'))).toBe(false);
    // Sunday 02:00 belongs to Saturday's, which is.
    const sunday2am = new Date(istMonday('02:00').getTime() - 24 * 3600_000);
    expect(isWithinWindow(satNight, sunday2am)).toBe(true);
  });

  // An author who set the days and not the hours meant those days, all day.
  it('treats a half-written window as days-only rather than never', () => {
    expect(isWithinWindow({ days: [1], from: '09:00' }, istMonday('23:00'))).toBe(true);
    expect(isWithinWindow({ days: [2], from: '09:00' }, istMonday('23:00'))).toBe(false);
    expect(isWithinWindow({ from: '09:00' }, istMonday('23:00'))).toBe(true);
  });

  it('ignores a time that is not a time', () => {
    expect(isWithinWindow({ from: 'morning', to: 'evening' }, istMonday('03:00'))).toBe(true);
    expect(isWithinWindow({ from: '25:00', to: '06:00' }, istMonday('03:00'))).toBe(true);
  });
});

describe('triggerOrder', () => {
  it('puts the highest priority first, oldest breaking the tie', () => {
    const flows = [
      flow({ id: 'new-low', createdAt: '2026-03-01', priority: 0 }),
      flow({ id: 'high', createdAt: '2026-05-01', priority: 5 }),
      flow({ id: 'old-low', createdAt: '2026-01-01', priority: 0 }),
    ];
    expect(triggerOrder(flows).map((f) => f.id)).toEqual(['high', 'old-low', 'new-low']);
  });

  it('treats a missing priority as 0', () => {
    const noPriority = flow({ id: 'legacy', createdAt: '2026-01-01' });
    delete (noPriority as { priority?: number | null }).priority;
    const high = flow({ id: 'high', createdAt: '2026-05-01', priority: 1 });
    expect(triggerOrder([noPriority, high]).map((f) => f.id)).toEqual(['high', 'legacy']);
  });

  // The one mistake this trigger type makes easy and invisible: a fallback that
  // wins on age or on a number someone typed swallows every specific trigger.
  it('always puts any_message last, whatever its priority', () => {
    const flows = [
      flow({ id: 'fallback', triggerType: 'any_message', createdAt: '2026-01-01', priority: 99 }),
      flow({ id: 'keyword', triggerValue: 'book', createdAt: '2026-06-01', priority: 0 }),
    ];
    expect(triggerOrder(flows).map((f) => f.id)).toEqual(['keyword', 'fallback']);
  });
});

describe('matchTrigger', () => {
  it('returns null when nothing matches', () => {
    expect(matchTrigger([flow({ id: 'a', triggerValue: 'book' })], signal({ message: 'hello' })))
      .toBeNull();
  });

  it('takes the first match in engine order', () => {
    const flows = [
      flow({ id: 'specific', triggerValue: 'book now', createdAt: '2026-06-01' }),
      flow({ id: 'general', triggerValue: 'book', createdAt: '2026-01-01' }),
    ];
    // "book" is older, so it wins — which is exactly what the editor's
    // shadowing warning tells the author about.
    expect(matchTrigger(flows, signal({ message: 'book now' }))?.id).toBe('general');
  });

  it('lets the fallback catch what nothing else does', () => {
    const flows = [
      flow({ id: 'fallback', triggerType: 'any_message' }),
      flow({ id: 'keyword', triggerValue: 'book' }),
    ];
    expect(matchTrigger(flows, signal({ message: 'book' }))?.id).toBe('keyword');
    expect(matchTrigger(flows, signal({ message: 'namaste' }))?.id).toBe('fallback');
  });

  // The after-hours pair, end to end. An out-of-hours flow must not block the
  // next candidate, which is why the window is checked after the trigger.
  it('picks the right one of two flows sharing a trigger by time of day', () => {
    const flows = [
      flow({ id: 'day', triggerValue: 'book', createdAt: '2026-01-01', activeWindow: { from: '09:00', to: '18:00' } }),
      flow({ id: 'night', triggerValue: 'book', createdAt: '2026-02-01', activeWindow: { from: '18:00', to: '09:00' } }),
    ];
    expect(matchTrigger(flows, signal({ message: 'book', now: istMonday('11:00') }))?.id).toBe('day');
    expect(matchTrigger(flows, signal({ message: 'book', now: istMonday('21:00') }))?.id).toBe('night');
    expect(matchTrigger(flows, signal({ message: 'book', now: istMonday('03:00') }))?.id).toBe('night');
  });

  it('matches nothing when the only candidate is out of hours', () => {
    const flows = [flow({ id: 'day', triggerValue: 'book', activeWindow: { from: '09:00', to: '18:00' } })];
    expect(matchTrigger(flows, signal({ message: 'book', now: istMonday('22:00') }))).toBeNull();
  });

  it('reproduces the old two-trigger behaviour exactly', () => {
    const live = [
      flow({ id: 'kw', triggerType: 'keyword', triggerValue: 'Know More', createdAt: '2026-10-27' }),
      flow({ id: 'first', triggerType: 'first_message', createdAt: '2026-06-25' }),
    ];
    expect(matchTrigger(live, signal({ message: 'hi', isFirstContactMessage: true }))?.id).toBe('first');
    expect(matchTrigger(live, signal({ message: 'Know More' }))?.id).toBe('kw');
    expect(matchTrigger(live, signal({ message: 'something else' }))).toBeNull();
  });
});

describe('needsAdId', () => {
  it('is only true when a candidate asks for it', () => {
    expect(needsAdId([flow({ id: 'a', triggerValue: 'book' })])).toBe(false);
    expect(needsAdId([flow({ id: 'a', triggerType: 'ad_click' })])).toBe(true);
  });
});

describe('describeTriggerType', () => {
  it('reads as a sentence for every type', () => {
    expect(describeTriggerType('keyword', 'Book Now')).toBe('When a message contains “Book Now”');
    expect(describeTriggerType('button', null)).toBe('When someone taps any button');
    expect(describeTriggerType('ad_click', '')).toBe('When someone arrives from any Meta ad');
    expect(describeTriggerType('manual', null)).toContain('Only when you');
    expect(describeTriggerType('any_message', null)).toContain('no other flow matched');
    expect(describeTriggerType(null, null)).toBe('No trigger set');
  });

  // An unset keyword must not read as though the flow works.
  it('says when a keyword has not been set', () => {
    expect(describeTriggerType('keyword', '  ')).toContain('have not set yet');
  });
});

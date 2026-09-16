import { describe, it, expect } from 'vitest';
import {
  normalizeChannel,
  isChannel,
  mergeTouch,
  CHANNELS,
  type TouchTimes,
} from '@/lib/lead-attribution';

describe('normalizeChannel', () => {
  it('maps known free-text sources to canonical channels', () => {
    expect(normalizeChannel('whatsapp_flow')).toBe('whatsapp');
    expect(normalizeChannel('meta_ad')).toBe('meta_ads');
    expect(normalizeChannel('facebook_ad')).toBe('meta_ads');
    expect(normalizeChannel('ctwa')).toBe('meta_ads');
    expect(normalizeChannel('adwords')).toBe('google_ads');
    expect(normalizeChannel('gmb')).toBe('gbp');
    expect(normalizeChannel('csv_import')).toBe('manual');
    expect(normalizeChannel('widget')).toBe('chat_widget');
  });

  it('is case- and separator-insensitive', () => {
    expect(normalizeChannel('  WhatsApp  ')).toBe('whatsapp');
    expect(normalizeChannel('Meta-Ad')).toBe('meta_ads');
    expect(normalizeChannel('Google Ads')).toBe('google_ads');
  });

  it('passes through values that are already canonical channels', () => {
    for (const c of CHANNELS) {
      expect(normalizeChannel(c)).toBe(c);
    }
  });

  it('falls back to "other" for empty/unknown values', () => {
    expect(normalizeChannel(null)).toBe('other');
    expect(normalizeChannel(undefined)).toBe('other');
    expect(normalizeChannel('')).toBe('other');
    expect(normalizeChannel('   ')).toBe('other');
    expect(normalizeChannel('something_random')).toBe('other');
  });

  it('honors a custom fallback', () => {
    expect(normalizeChannel(null, 'whatsapp')).toBe('whatsapp');
    expect(normalizeChannel('nope', 'manual')).toBe('manual');
  });

  it('maps Facebook Messenger to other (no first-class channel)', () => {
    expect(normalizeChannel('messenger')).toBe('other');
    expect(normalizeChannel('facebook')).toBe('other');
  });
});

describe('isChannel', () => {
  it('accepts canonical channels and rejects everything else', () => {
    expect(isChannel('whatsapp')).toBe(true);
    expect(isChannel('gbp')).toBe(true);
    expect(isChannel('nope')).toBe(false);
    expect(isChannel(42)).toBe(false);
    expect(isChannel(null)).toBe(false);
  });
});

describe('mergeTouch', () => {
  const empty: TouchTimes = {
    firstChannel: null,
    firstAt: null,
    lastChannel: null,
    lastAt: null,
  };

  it('seeds both first and last on the very first touch', () => {
    const r = mergeTouch(empty, { channel: 'whatsapp', at: '2026-09-10T10:00:00.000Z' });
    expect(r).toEqual({
      firstChannel: 'whatsapp',
      firstAt: '2026-09-10T10:00:00.000Z',
      lastChannel: 'whatsapp',
      lastAt: '2026-09-10T10:00:00.000Z',
    });
  });

  it('advances only last-touch for a later touch', () => {
    const start: TouchTimes = {
      firstChannel: 'whatsapp',
      firstAt: '2026-09-10T10:00:00.000Z',
      lastChannel: 'whatsapp',
      lastAt: '2026-09-10T10:00:00.000Z',
    };
    const r = mergeTouch(start, { channel: 'meta_ads', at: '2026-09-12T09:00:00.000Z' });
    expect(r.firstChannel).toBe('whatsapp');
    expect(r.firstAt).toBe('2026-09-10T10:00:00.000Z');
    expect(r.lastChannel).toBe('meta_ads');
    expect(r.lastAt).toBe('2026-09-12T09:00:00.000Z');
  });

  it('moves first-touch back when an earlier touch is backfilled', () => {
    const start: TouchTimes = {
      firstChannel: 'whatsapp',
      firstAt: '2026-09-10T10:00:00.000Z',
      lastChannel: 'whatsapp',
      lastAt: '2026-09-10T10:00:00.000Z',
    };
    const r = mergeTouch(start, { channel: 'campaign', at: '2026-09-01T08:00:00.000Z' });
    expect(r.firstChannel).toBe('campaign');
    expect(r.firstAt).toBe('2026-09-01T08:00:00.000Z');
    // last-touch stays (earlier touch does not advance it)
    expect(r.lastChannel).toBe('whatsapp');
    expect(r.lastAt).toBe('2026-09-10T10:00:00.000Z');
  });

  it('treats an equal timestamp as a last-touch update', () => {
    const start: TouchTimes = {
      firstChannel: 'whatsapp',
      firstAt: '2026-09-10T10:00:00.000Z',
      lastChannel: 'whatsapp',
      lastAt: '2026-09-10T10:00:00.000Z',
    };
    const r = mergeTouch(start, { channel: 'instagram', at: '2026-09-10T10:00:00.000Z' });
    expect(r.lastChannel).toBe('instagram');
    expect(r.firstChannel).toBe('whatsapp');
  });

  it('ignores un-parseable timestamps without throwing', () => {
    const r = mergeTouch(empty, { channel: 'whatsapp', at: 'not-a-date' });
    expect(r).toEqual(empty);
  });

  it('never mutates the input object', () => {
    const start: TouchTimes = { ...empty };
    mergeTouch(start, { channel: 'whatsapp', at: '2026-09-10T10:00:00.000Z' });
    expect(start).toEqual(empty);
  });
});

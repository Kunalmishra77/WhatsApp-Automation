import { describe, it, expect } from 'vitest';
import { assessBotHealth, type BotHealthRow } from './bot-health';

const row = (over: Partial<BotHealthRow> = {}): BotHealthRow => ({
  workspace_id: 'w1', workspace_name: 'Test',
  inbound: 500, bot_replies: 500, refusals: 0, refused_contacts: 0,
  fallbacks: 0, median_reply_sec: 11,
  ...over,
});

describe('assessBotHealth', () => {
  it('reports healthy for a normal week', () => {
    const v = assessBotHealth(row(), 7);
    expect(v.worst).toBe('ok');
    expect(v.headline).toBeNull();
  });

  // The regression this exists to catch: 313 refusals out of 1143 replies in the
  // week of 18 Oct 2026, while every other number looked fine.
  it('flags the September guardrail regression', () => {
    const v = assessBotHealth(row({ bot_replies: 1143, refusals: 313, refused_contacts: 130 }), 7);
    expect(v.refusalPct).toBeCloseTo(27.4, 1);
    expect(v.refusalLevel).toBe('bad');
    expect(v.headline).toContain('Turning customers away');
  });

  it('flags an AI outage from the fallback rate', () => {
    // 17-19 Oct: ~60 fallbacks a day while refusals and latency were normal.
    const v = assessBotHealth(row({ fallbacks: 119 }), 7);
    expect(v.fallbackLevel).toBe('bad');
    expect(v.headline).toContain('AI failing');
  });

  it('flags slow replies', () => {
    const v = assessBotHealth(row({ median_reply_sec: 30 }), 7);
    expect(v.latencyLevel).toBe('bad');
    expect(v.headline).toContain('Slow');
  });

  // A quiet client must not light up red because one of its four replies was a
  // redirect — that is noise, and a dashboard that cries wolf gets ignored.
  it('does not judge a client with too few replies', () => {
    const v = assessBotHealth(row({ bot_replies: 4, refusals: 1, inbound: 4 }), 7);
    expect(v.refusalLevel).toBe('ok');
    expect(v.worst).toBe('ok');
  });

  it('treats a client with no traffic as healthy, not slow', () => {
    const v = assessBotHealth(row({ inbound: 0, bot_replies: 0, median_reply_sec: null }), 7);
    expect(v.worst).toBe('ok');
  });

  // Refusals are the headline when several things are wrong at once: a bot that
  // turns buyers away costs more than one that answers late.
  it('leads with refusals when more than one metric is bad', () => {
    const v = assessBotHealth(
      row({ bot_replies: 500, refusals: 200, refused_contacts: 60, fallbacks: 100, median_reply_sec: 40 }),
      7,
    );
    expect(v.worst).toBe('bad');
    expect(v.headline).toContain('Turning customers away');
  });
});

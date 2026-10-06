import { describe, it, expect } from 'vitest';
import { parseClassification, applyLeadClassification, scoreToTemperature, DEFAULT_THRESHOLDS, type LeadRow, type LeadClassification } from './lead-classifier';

describe('parseClassification', () => {
  const good = JSON.stringify({
    stage: 'interested', confidence: 82, reason: 'asked price + timeline twice',
    needs_follow_up: false, follow_up_reason: null, converted: false, conversion_quote: null,
  });
  it('parses valid JSON', () => {
    const r = parseClassification(good);
    expect(r).not.toBeNull();
    expect(r!.stage).toBe('interested');
    expect(r!.confidence).toBe(82);
  });
  it('extracts JSON from a ```json fenced block', () => {
    expect(parseClassification('```json\n' + good + '\n```')?.stage).toBe('interested');
  });
  it('returns null on malformed JSON', () => {
    expect(parseClassification('not json at all')).toBeNull();
  });
  it('returns null on an out-of-enum stage', () => {
    expect(parseClassification(JSON.stringify({ ...JSON.parse(good), stage: 'super_hot' }))).toBeNull();
  });
  it('clamps confidence to 0..100', () => {
    expect(parseClassification(JSON.stringify({ ...JSON.parse(good), confidence: 150 }))?.confidence).toBe(100);
    expect(parseClassification(JSON.stringify({ ...JSON.parse(good), confidence: -5 }))?.confidence).toBe(0);
  });
  it('coerces a missing confidence to 0 and missing booleans to false', () => {
    const r = parseClassification(JSON.stringify({ stage: 'new', reason: 'x' }));
    expect(r?.confidence).toBe(0);
    expect(r?.needs_follow_up).toBe(false);
    expect(r?.converted).toBe(false);
  });
});

const NOW = new Date('2026-08-16T10:00:00Z');
const lead = (over: Partial<LeadRow> = {}): LeadRow =>
  ({ id: 'L1', workspace_id: 'W1', contact_id: 'C1', stage: 'new', follow_up_at: null, temperature: 'cold', ...over });
const cls = (over: Partial<LeadClassification> = {}): LeadClassification =>
  ({ stage: 'interested', confidence: 85, reason: 'r', score: 75, signals: ['asked price'], needs_follow_up: false,
     follow_up_reason: null, converted: false, conversion_quote: null, ...over });

describe('scoreToTemperature', () => {
  it('maps score to bands (defaults 61/31)', () => {
    expect(scoreToTemperature(10)).toBe('cold');
    expect(scoreToTemperature(30)).toBe('cold');
    expect(scoreToTemperature(31)).toBe('warm');
    expect(scoreToTemperature(60)).toBe('warm');
    expect(scoreToTemperature(61)).toBe('hot');
    expect(scoreToTemperature(100)).toBe('hot');
  });
  it('honours custom thresholds', () => {
    expect(scoreToTemperature(50, { hot: 80, warm: 40 })).toBe('warm');
    expect(scoreToTemperature(85, { hot: 80, warm: 40 })).toBe('hot');
  });
});

describe('parseClassification — score + signals', () => {
  it('parses an explicit score + signals', () => {
    const r = parseClassification(JSON.stringify({ stage: 'contacted', confidence: 60, reason: 'x', score: 22, signals: ['only a greeting'] }));
    expect(r?.score).toBe(22);
    expect(r?.signals).toEqual(['only a greeting']);
  });
  it('defaults a missing score from the stage (not 0)', () => {
    const r = parseClassification(JSON.stringify({ stage: 'interested', confidence: 70, reason: 'x' }));
    expect(r?.score).toBe(70); // STAGE_DEFAULT_SCORE.interested
    expect(r?.signals).toEqual([]);
  });
  it('clamps score to 0..100', () => {
    expect(parseClassification(JSON.stringify({ stage: 'new', score: 999, reason: 'x' }))?.score).toBe(100);
  });
});

describe('applyLeadClassification', () => {
  it('moves stage + emits a history row when confident and changed', () => {
    const w = applyLeadClassification(lead(), cls(), NOW);
    expect(w.leadUpdate.stage).toBe('interested');
    expect(w.leadUpdate.stage_source).toBe('ai');
    expect(w.historyRow).toMatchObject({ from_stage: 'new', to_stage: 'interested', source: 'ai' });
  });
  it('does NOT move below the confidence threshold (metadata only, no history)', () => {
    const w = applyLeadClassification(lead(), cls({ confidence: 50 }), NOW);
    expect(w.leadUpdate.stage).toBeUndefined();
    expect(w.leadUpdate.ai_stage_confidence).toBe(50);
    expect(w.historyRow).toBeNull();
  });
  it('does NOT move or emit history when stage is unchanged', () => {
    const w = applyLeadClassification(lead({ stage: 'interested' }), cls(), NOW);
    expect(w.leadUpdate.stage).toBeUndefined();
    expect(w.historyRow).toBeNull();
  });
  it('conversion sets converted + closed_at + review flag + promotes contact', () => {
    const w = applyLeadClassification(lead(), cls({ converted: true, conversion_quote: 'paid via UPI' }), NOW);
    expect(w.leadUpdate.stage).toBe('converted');
    expect(w.leadUpdate.closed_at).toEqual(NOW.toISOString());
    expect(w.leadUpdate.converted_signal).toBe('paid via UPI');
    expect(w.leadUpdate.conversion_reviewed).toBe(false);
    expect(w.promoteContact).toBe(true);
    expect(w.historyRow?.to_stage).toBe('converted');
  });
  it('follow-up sets fields + a default due date when none in the future', () => {
    const w = applyLeadClassification(lead(), cls({ needs_follow_up: true, follow_up_reason: 'quiet 2d' }), NOW);
    expect(w.leadUpdate.needs_follow_up).toBe(true);
    expect(w.leadUpdate.follow_up_at).toEqual(new Date('2026-08-17T10:00:00Z').toISOString());
    expect(w.leadUpdate.follow_up_reason).toBe('quiet 2d');
  });
  it('follow-up does NOT overwrite a human-set future follow_up_at', () => {
    const future = '2026-08-20T10:00:00Z';
    const w = applyLeadClassification(lead({ follow_up_at: future }), cls({ needs_follow_up: true }), NOW);
    expect(w.leadUpdate.follow_up_at).toBeUndefined();
  });
  it('clears needs_follow_up when the AI says none is needed', () => {
    const w = applyLeadClassification(lead(), cls({ needs_follow_up: false }), NOW);
    expect(w.leadUpdate.needs_follow_up).toBe(false);
  });
  it('never sets needs_follow_up on a lost lead, even when the AI flags one', () => {
    const w = applyLeadClassification(
      lead({ stage: 'lost' }),
      cls({ stage: 'lost', needs_follow_up: true, follow_up_reason: 'quiet 2d' }),
      NOW,
    );
    expect(w.leadUpdate.needs_follow_up).toBe(false);
    expect(w.leadUpdate.follow_up_at).toBeUndefined();
  });

  // ── Unified scoring + derived temperature ──
  it('always records score, confidence and signals', () => {
    const w = applyLeadClassification(lead(), cls({ score: 42, confidence: 80, signals: ['asked availability'] }), NOW);
    expect(w.leadUpdate.ai_score).toBe(42);
    expect(w.leadUpdate.score_confidence).toBe(80);
    expect(w.leadUpdate.score_signals).toEqual(['asked availability']);
  });
  it('derives temperature from score + logs the band transition', () => {
    const w = applyLeadClassification(lead({ temperature: 'cold' }), cls({ score: 75, confidence: 80 }), NOW);
    expect(w.leadUpdate.temperature).toBe('hot');
    expect(w.scoreHistoryRow).toMatchObject({ from_temperature: 'cold', to_temperature: 'hot', score: 75 });
  });
  it('a single generic message (low score) stays Cold — the 1-message-Hot fix', () => {
    const w = applyLeadClassification(lead({ temperature: 'cold' }), cls({ stage: 'new', score: 15, confidence: 85, signals: ['only a greeting'] }), NOW);
    // Derived temp is 'cold' (score 15) — unchanged from current, so no write + no history.
    // The key assertion: it never becomes 'hot' from one low-score message.
    expect(w.leadUpdate.temperature).toBeUndefined();
    expect(scoreToTemperature(15)).toBe('cold');
    expect(w.scoreHistoryRow).toBeNull();
  });
  it('derives temperature from the score even at low confidence (badge must track the score)', () => {
    const w = applyLeadClassification(lead({ temperature: 'cold' }), cls({ score: 90, confidence: 40 }), NOW);
    expect(w.leadUpdate.temperature).toBe('hot');
    expect(w.scoreHistoryRow).toMatchObject({ from_temperature: 'cold', to_temperature: 'hot', score: 90 });
    expect(w.leadUpdate.ai_score).toBe(90);
  });
  it('can cool a lead down (hot → warm) — no longer escalate-only', () => {
    const w = applyLeadClassification(lead({ temperature: 'hot' }), cls({ score: 45, confidence: 70 }), NOW);
    expect(w.leadUpdate.temperature).toBe('warm');
    expect(w.scoreHistoryRow).toMatchObject({ from_temperature: 'hot', to_temperature: 'warm' });
  });
  it('does not touch temperature on conversion (terminal state)', () => {
    const w = applyLeadClassification(lead({ temperature: 'warm' }), cls({ converted: true, conversion_quote: 'paid', score: 95, confidence: 90 }), NOW);
    expect(w.leadUpdate.stage).toBe('converted');
    expect(w.leadUpdate.temperature).toBeUndefined();
    expect(w.scoreHistoryRow).toBeNull();
  });
  it('does not re-log when temperature band is unchanged', () => {
    const w = applyLeadClassification(lead({ temperature: 'hot' }), cls({ score: 80, confidence: 85 }), NOW);
    expect(w.leadUpdate.temperature).toBeUndefined();
    expect(w.scoreHistoryRow).toBeNull();
  });
});

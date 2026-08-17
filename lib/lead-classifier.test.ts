import { describe, it, expect } from 'vitest';
import { parseClassification, applyLeadClassification, type LeadRow, type LeadClassification } from './lead-classifier';

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
  ({ id: 'L1', workspace_id: 'W1', contact_id: 'C1', stage: 'new', follow_up_at: null, ...over });
const cls = (over: Partial<LeadClassification> = {}): LeadClassification =>
  ({ stage: 'interested', confidence: 85, reason: 'r', needs_follow_up: false,
     follow_up_reason: null, converted: false, conversion_quote: null, ...over });

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
});

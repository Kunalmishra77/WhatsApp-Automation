import { describe, it, expect } from 'vitest';
import { buildLeadCaptureFlowJson, NATIVE_FLOW_TEMPLATES, parseNfmReply, newFlowToken } from './native-flows';

describe('buildLeadCaptureFlowJson', () => {
  it('emits a single terminal screen with the expected fields + complete action', () => {
    const j = buildLeadCaptureFlowJson() as any;
    expect(j.version).toBeDefined();
    expect(Array.isArray(j.screens)).toBe(true);
    expect(j.screens).toHaveLength(1);
    const screen = j.screens[0];
    expect(screen.id).toBe('LEAD_CAPTURE');
    expect(screen.terminal).toBe(true);
    const flat = JSON.stringify(screen);
    expect(flat).toContain('full_name');
    expect(flat).toContain('phone');
    expect(flat).toContain('email');
    expect(flat).toContain('"name":"complete"');
  });
});
describe('NATIVE_FLOW_TEMPLATES', () => {
  it('has lead_capture with a firstScreen + builder', () => {
    const t = NATIVE_FLOW_TEMPLATES['lead_capture'];
    expect(t).toBeTruthy();
    expect(t!.firstScreen).toBe('LEAD_CAPTURE');
    expect(typeof t!.buildJson).toBe('function');
  });
});
describe('parseNfmReply', () => {
  it('extracts flow_token + fields from a valid response_json', () => {
    const r = parseNfmReply(JSON.stringify({ flow_token: 'flw_x', full_name: 'Asha', email: 'a@b.com' }));
    expect(r.flow_token).toBe('flw_x');
    expect(r.fields.full_name).toBe('Asha');
    expect(r.fields.email).toBe('a@b.com');
    expect(r.fields.flow_token).toBeUndefined();
  });
  it('returns empty result on malformed input, never throws', () => {
    expect(parseNfmReply('not json')).toEqual({ flow_token: null, fields: {} });
    expect(parseNfmReply('')).toEqual({ flow_token: null, fields: {} });
  });
});
describe('newFlowToken', () => {
  it('is prefixed + unique', () => {
    const a = newFlowToken(), b = newFlowToken();
    expect(a.startsWith('flw_')).toBe(true);
    expect(a).not.toBe(b);
  });
});

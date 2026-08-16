import { describe, it, expect } from 'vitest';
import { generateOtp, hashOtp } from './email-otp';

describe('generateOtp', () => {
  it('is 6 digits', () => { expect(generateOtp()).toMatch(/^\d{6}$/); });
  it('varies', () => { const s = new Set(Array.from({length:20},()=>generateOtp())); expect(s.size).toBeGreaterThan(1); });
});

describe('hashOtp', () => {
  it('is deterministic sha256 hex, not the plaintext', () => {
    const h = hashOtp('123456');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(hashOtp('123456'));
    expect(h).not.toBe(hashOtp('654321'));
  });
});

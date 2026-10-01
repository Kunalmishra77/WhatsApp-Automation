import { describe, it, expect, beforeAll } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted } from '@/lib/crypto-vault';

beforeAll(() => {
  // Deterministic 32-byte hex key for the test.
  process.env.CREDENTIAL_ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('crypto-vault', () => {
  it('round-trips a secret', () => {
    const secret = 'IGQVJ-super-secret-access-token-123';
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('produces different ciphertext each time (random IV)', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });

  it('returns null on tampered or malformed input', () => {
    expect(decryptSecret('not-encrypted')).toBeNull();
    expect(decryptSecret(null)).toBeNull();
    const enc = encryptSecret('hello');
    expect(decryptSecret(enc.slice(0, -4) + 'AAAA')).toBeNull();
  });

  it('isEncrypted distinguishes plaintext from ciphertext', () => {
    expect(isEncrypted('plain-token')).toBe(false);
    expect(isEncrypted(encryptSecret('t'))).toBe(true);
  });
});

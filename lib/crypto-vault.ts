// lib/crypto-vault.ts
// AES-256-GCM encryption for sensitive per-workspace credentials (e.g. Instagram
// App Secret / access tokens) so they are never stored in plaintext.
//
// Key: prefers CREDENTIAL_ENCRYPTION_KEY (hex-32-bytes, base64-32-bytes, or a
// passphrase). Falls back to deriving a key from SUPABASE_SERVICE_ROLE_KEY (a
// high-entropy secret already present) so encryption works without new env setup
// — set CREDENTIAL_ENCRYPTION_KEY to rotate independently of Supabase.

import crypto from 'node:crypto';

const KEY_SALT = 'agentix-credential-vault-v1';

function getKey(): Buffer {
  const explicit = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (explicit) {
    if (/^[0-9a-f]{64}$/i.test(explicit)) return Buffer.from(explicit, 'hex');
    const b = Buffer.from(explicit, 'base64');
    if (b.length === 32) return b;
    return crypto.scryptSync(explicit, KEY_SALT, 32);
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!fallback) throw new Error('crypto-vault: no encryption key (set CREDENTIAL_ENCRYPTION_KEY)');
  return crypto.scryptSync(fallback, KEY_SALT, 32);
}

// Returns a self-describing string: v1:<iv>:<tag>:<ciphertext> (all base64).
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

// Decrypts a blob from encryptSecret. Returns null on any tamper/format/key error.
export function decryptSecret(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    const parts = blob.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    const [, ivB, tagB, dataB] = parts as [string, string, string, string];
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('v1:') && value.split(':').length === 4;
}

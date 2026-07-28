import { describe, expect, it } from 'vitest';
import { webhookIdemKey, isWebhookProcessed, markWebhookProcessed } from '../lib/webhook-idempotency';

function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
  };
}
const throwingRedis = { get: async () => { throw new Error('down'); }, set: async () => { throw new Error('down'); }, del: async () => {} };

describe('webhookIdemKey', () => {
  it('uses the signature when present', () => {
    expect(webhookIdemKey('sha256=abc', ['m1'])).toBe('sha256=abc');
  });
  it('falls back to a stable hash of sorted ids when no signature', () => {
    const a = webhookIdemKey('', ['m2', 'm1']);
    const b = webhookIdemKey(null, ['m1', 'm2']);
    expect(a).toBe(b);
    expect(a.startsWith('h:')).toBe(true);
  });
});

describe('isWebhookProcessed / markWebhookProcessed', () => {
  it('is false before marking, true after', async () => {
    const r = fakeRedis();
    expect(await isWebhookProcessed('k1', r)).toBe(false);
    await markWebhookProcessed('k1', r);
    expect(await isWebhookProcessed('k1', r)).toBe(true);
  });
  it('returns false when redis is null (fail-open)', async () => {
    expect(await isWebhookProcessed('k1', null)).toBe(false);
  });
  it('returns false when redis throws (fail-open)', async () => {
    expect(await isWebhookProcessed('k1', throwingRedis)).toBe(false);
  });
  it('mark never throws when redis throws', async () => {
    await expect(markWebhookProcessed('k1', throwingRedis)).resolves.toBeUndefined();
  });
  it('empty key is treated as not processed', async () => {
    expect(await isWebhookProcessed('', fakeRedis())).toBe(false);
  });
});

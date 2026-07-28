// tests/workspace-cache.test.ts
import { describe, expect, it } from 'vitest';
import { getWorkspaceByPhoneNumberId, getWorkspaceById, invalidateWorkspace } from '../lib/workspace-cache';

function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
  };
}
// Supabase-like builder: .from().select().eq() resolves to { data, error }.
function fakeSupabase(result: { data: unknown; error: unknown }, onCall?: () => void) {
  return { from: () => ({ select: () => ({ eq: () => { onCall?.(); return Promise.resolve(result); } }) }) };
}
const row = { id: 'w1', phone_number_id: 'p1', access_token: 't', name: 'WS', settings: { a: 1 } };

describe('getWorkspaceByPhoneNumberId', () => {
  it('returns the DB row on a miss and backfills both cache keys', async () => {
    const r = fakeRedis();
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [row], error: null }), 'p1', r);
    expect(got).toEqual(row);
    expect(r.store.get('agentix:ws:pnid:p1')).toBeTruthy();
    expect(r.store.get('agentix:ws:id:w1')).toBeTruthy();
  });

  it('returns the cached row without hitting the DB on a hit', async () => {
    const r = fakeRedis();
    r.store.set('agentix:ws:pnid:p1', JSON.stringify(row));
    let dbCalled = false;
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [row], error: null }, () => { dbCalled = true; }), 'p1', r);
    expect(got).toEqual(row);
    expect(dbCalled).toBe(false);
  });

  it('does NOT cache an ambiguous (multiple-row) result and returns null', async () => {
    const r = fakeRedis();
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [row, { ...row, id: 'w2' }], error: null }), 'p1', r);
    expect(got).toBeNull();
    expect(r.store.size).toBe(0);
  });

  it('falls back to the DB when redis.get throws', async () => {
    const throwing = { get: async () => { throw new Error('down'); }, set: async () => {}, del: async () => {} };
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [row], error: null }), 'p1', throwing);
    expect(got).toEqual(row);
  });

  it('returns null for a null phoneNumberId', async () => {
    const got = await getWorkspaceByPhoneNumberId(fakeSupabase({ data: [], error: null }), null, fakeRedis());
    expect(got).toBeNull();
  });
});

describe('getWorkspaceById', () => {
  it('returns the DB row on a miss and caches it', async () => {
    const r = fakeRedis();
    const got = await getWorkspaceById(fakeSupabase({ data: [row], error: null }), 'w1', r);
    expect(got).toEqual(row);
    expect(r.store.get('agentix:ws:id:w1')).toBeTruthy();
  });
});

describe('invalidateWorkspace', () => {
  it('deletes both cache keys', async () => {
    const r = fakeRedis();
    r.store.set('agentix:ws:id:w1', '{}');
    r.store.set('agentix:ws:pnid:p1', '{}');
    await invalidateWorkspace({ id: 'w1', phoneNumberId: 'p1' }, r);
    expect(r.store.size).toBe(0);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { upsertLead, isDuplicateLeadError } from './lead-upsert';

// A fake of just the two chains upsertLead walks: an upsert that selects one
// row, and a filtered select that reads one back.
function fakeDb(opts: {
  upsertReturns?: { id: string } | null;
  upsertError?: { message: string } | null;
  existing?: { id: string } | null;
}) {
  const calls = { upsert: 0, select: 0, payload: null as unknown };
  const db = {
    from() {
      return {
        upsert(payload: unknown, options: unknown) {
          calls.upsert++;
          calls.payload = payload;
          (calls as Record<string, unknown>).options = options;
          return {
            select: () => ({
              maybeSingle: async () => ({
                data: opts.upsertReturns ?? null,
                error: opts.upsertError ?? null,
              }),
            }),
          };
        },
        select() {
          calls.select++;
          const chain: Record<string, unknown> = {};
          chain.eq = () => chain;
          chain.limit = () => chain;
          chain.maybeSingle = async () => ({ data: opts.existing ?? null, error: null });
          return chain;
        },
      };
    },
  };
  return { db, calls };
}

const PAYLOAD = { workspace_id: 'w1', contact_id: 'c1', title: 'Lead — Amit', stage: 'new' };

describe('upsertLead', () => {
  it('reports created when it inserted the row', async () => {
    const { db, calls } = fakeDb({ upsertReturns: { id: 'lead-new' } });
    const r = await upsertLead(db, PAYLOAD);
    expect(r).toEqual({ id: 'lead-new', created: true });
    // No second query when the insert succeeded.
    expect(calls.select).toBe(0);
  });

  // The whole point: under a race the loser must still come away with the id of
  // the lead that does exist, so its touchpoint attaches to the right row.
  it('returns the existing lead when the insert was ignored', async () => {
    const { db, calls } = fakeDb({ upsertReturns: null, existing: { id: 'lead-winner' } });
    const r = await upsertLead(db, PAYLOAD);
    expect(r).toEqual({ id: 'lead-winner', created: false });
    expect(calls.select).toBe(1);
  });

  // `created` is what callers branch on for once-per-lead work, so exactly one
  // racer may see true.
  it('never reports created for the losing call', async () => {
    const { db } = fakeDb({ upsertReturns: null, existing: { id: 'lead-winner' } });
    expect((await upsertLead(db, PAYLOAD)).created).toBe(false);
  });

  it('does not overwrite an existing lead', async () => {
    const { db, calls } = fakeDb({ upsertReturns: null, existing: { id: 'x' } });
    await upsertLead(db, PAYLOAD);
    expect((calls as Record<string, unknown>).options).toMatchObject({
      onConflict: 'workspace_id,contact_id',
      ignoreDuplicates: true,
    });
  });

  it('falls back to the existing row when the insert errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb({ upsertError: { message: 'boom' }, existing: { id: 'lead-old' } });
    const r = await upsertLead(db, PAYLOAD);
    expect(r).toEqual({ id: 'lead-old', created: false });
    spy.mockRestore();
  });

  it('returns a null id rather than throwing when nothing can be found', async () => {
    const { db } = fakeDb({ upsertReturns: null, existing: null });
    expect(await upsertLead(db, PAYLOAD)).toEqual({ id: null, created: false });
  });
});

describe('isDuplicateLeadError', () => {
  it('recognises the unique violation by code', () => {
    expect(isDuplicateLeadError({ code: '23505' })).toBe(true);
  });

  it('recognises it by the index name, for clients that drop the code', () => {
    expect(isDuplicateLeadError({ message: 'duplicate key value violates unique constraint "leads_workspace_contact_unique"' })).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isDuplicateLeadError({ code: '23503', message: 'foreign key' })).toBe(false);
    expect(isDuplicateLeadError(null)).toBe(false);
    expect(isDuplicateLeadError(undefined)).toBe(false);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { webhookHandler, isSafeWebhookUrl, readPath } from './webhook';

describe('isSafeWebhookUrl — the call is made from inside our network', () => {
  it('allows an ordinary public endpoint', () => {
    for (const ok of [
      'https://hooks.zapier.com/abc',
      'https://script.google.com/macros/s/xyz/exec',
      'http://api.someclient.com/leads',
      'https://api.someclient.com:8443/leads',
    ]) {
      expect(isSafeWebhookUrl(ok), ok).toBe(true);
    }
  });

  // The one that matters most: this address hands out the host's cloud
  // credentials to anything that can reach it.
  it('refuses the cloud metadata address', () => {
    expect(isSafeWebhookUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('refuses our own machine', () => {
    for (const bad of [
      'http://localhost:3000/api/admin',
      'http://127.0.0.1/',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://db.internal/',
      'http://printer.local/',
    ]) {
      expect(isSafeWebhookUrl(bad), bad).toBe(false);
    }
  });

  it('refuses private networks', () => {
    for (const bad of ['http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.16.0.3/', 'http://172.31.255.1/']) {
      expect(isSafeWebhookUrl(bad), bad).toBe(false);
    }
  });

  // 172.15 and 172.32 are public; refusing them would block real endpoints.
  it('does not over-reach on the 172 range', () => {
    expect(isSafeWebhookUrl('http://172.15.0.1/')).toBe(true);
    expect(isSafeWebhookUrl('http://172.32.0.1/')).toBe(true);
  });

  it('refuses anything that is not http', () => {
    for (const bad of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/', 'not a url']) {
      expect(isSafeWebhookUrl(bad), bad).toBe(false);
    }
  });
});

describe('readPath', () => {
  it('reads a nested field', () => {
    expect(readPath({ data: { slot: { time: '10am' } } }, 'data.slot.time')).toBe('10am');
  });

  it('is undefined for a path that is not there', () => {
    expect(readPath({ a: 1 }, 'a.b.c')).toBeUndefined();
    expect(readPath(null, 'a')).toBeUndefined();
  });
});

function ctxFor(data: object, webhook?: { ok: boolean; data?: unknown }) {
  const calls: Array<Record<string, unknown>> = [];
  const ctx = {
    node: { id: 'w1', type: 'webhook', data, position: { x: 0, y: 0 } },
    flow: { nodes: [], edges: [] },
    incoming: '',
    vars: { name_text: 'Amit' },
    send: { text: vi.fn(), buttons: vi.fn(), media: vi.fn(), location: vi.fn(), list: vi.fn(), template: vi.fn() },
    ai: { reply: async () => null },
    ops: {
      callWebhook: async (req: Record<string, unknown>) => {
        calls.push(req);
        return webhook ?? { ok: true, data: {} };
      },
    },
    workspaceId: 'w', conversationId: 'c', sessionId: 's',
    contactId: null, contactPhone: '91',
    interpolate: (t: string) => t.replace(/\{\{\s*name\s*\}\}/g, 'Amit'),
  };
  return { ctx, calls };
}

describe('webhookHandler', () => {
  it('posts the collected answers and takes the ok branch', async () => {
    const { ctx, calls } = ctxFor({
      url: 'https://api.someclient.com/leads',
      body: [{ key: 'customer', value: '{{name}}' }, { key: 'source', value: 'whatsapp' }],
    });
    const r = await webhookHandler.run(ctx as never);
    expect(calls[0]).toMatchObject({
      url: 'https://api.someclient.com/leads',
      method: 'POST',
      payload: { customer: 'Amit', source: 'whatsapp' },
    });
    expect(r.outcome).toEqual({ next: 'edge', handle: 'ok' });
  });

  it('reads values back into the flow', async () => {
    const { ctx } = ctxFor(
      { url: 'https://api.someclient.com/slot', saveFrom: [{ responseKey: 'data.slot', saveAs: 'slot' }] },
      { ok: true, data: { data: { slot: 'Monday 10am' } } },
    );
    const r = await webhookHandler.run(ctx as never);
    expect(r.setVars).toMatchObject({ slot_text: 'Monday 10am' });
  });

  // An object interpolated into a message would reach the customer as
  // "[object Object]".
  it('refuses to save a nested object as an answer', async () => {
    const { ctx } = ctxFor(
      { url: 'https://api.someclient.com/x', saveFrom: [{ responseKey: 'data', saveAs: 'thing' }] },
      { ok: true, data: { data: { nested: true } } },
    );
    const r = await webhookHandler.run(ctx as never);
    expect(r.setVars ?? {}).not.toHaveProperty('thing_text');
  });

  // Someone else's server being down is an ordinary event, not a crash.
  it('takes the failed branch when the call does not succeed', async () => {
    const { ctx } = ctxFor({ url: 'https://api.someclient.com/x' }, { ok: false });
    expect((await webhookHandler.run(ctx as never)).outcome).toEqual({ next: 'edge', handle: 'failed' });
  });

  it('takes the failed branch when no URL is set', async () => {
    const { ctx, calls } = ctxFor({ url: '' });
    expect((await webhookHandler.run(ctx as never)).outcome).toEqual({ next: 'edge', handle: 'failed' });
    expect(calls).toEqual([]);
  });

  it('never calls an address inside our own network', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, calls } = ctxFor({ url: 'http://169.254.169.254/latest/meta-data/' });
    const r = await webhookHandler.run(ctx as never);
    expect(calls).toEqual([]);
    expect(r.outcome).toEqual({ next: 'edge', handle: 'failed' });
    spy.mockRestore();
  });

  it('caps how long a flow can be held up by someone else', async () => {
    const { ctx, calls } = ctxFor({ url: 'https://api.someclient.com/x', timeoutSeconds: 600 });
    await webhookHandler.run(ctx as never);
    expect(calls[0]!.timeoutSeconds).toBe(30);
  });

  it('offers a branch for success and one for failure', () => {
    expect(webhookHandler.handles!({})).toEqual(['ok', 'failed']);
  });
});

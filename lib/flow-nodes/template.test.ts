import { describe, it, expect, vi } from 'vitest';
import { templateHandler } from './template';
import { validateFlow } from '../flow-validate';

function ctxFor(data: object, vars: Record<string, string | number> = {}) {
  const sent: Array<{ name: string; language: string; params: string[] }> = [];
  const ctx = {
    node: { id: 't1', type: 'template', data, position: { x: 0, y: 0 } },
    flow: { nodes: [], edges: [] },
    incoming: '',
    vars,
    send: {
      text: vi.fn(), buttons: vi.fn(), media: vi.fn(), location: vi.fn(), list: vi.fn(),
      template: async (name: string, language: string, params: string[]) => {
        sent.push({ name, language, params });
      },
    },
    ops: {} as never,
    workspaceId: 'w', conversationId: 'c', sessionId: 's',
    contactId: null, contactPhone: '91',
    interpolate: (text: string) =>
      text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k: string) => String(vars[`${k}_text`] ?? vars[k] ?? '')),
  };
  return { ctx, sent };
}

describe('templateHandler', () => {
  it('sends the chosen template and moves on', async () => {
    const { ctx, sent } = ctxFor({ templateName: 'demo_reminder', language: 'en' });
    const r = await templateHandler.run(ctx as never);
    expect(sent).toEqual([{ name: 'demo_reminder', language: 'en', params: [] }]);
    expect(r.outcome).toEqual({ next: 'edge' });
  });

  it('fills the template blanks from answers the flow saved', async () => {
    const { ctx, sent } = ctxFor(
      { templateName: 'demo_reminder', language: 'en', bodyParams: ['{{name}}', 'Monday'] },
      { name_text: 'Amit' },
    );
    await templateHandler.run(ctx as never);
    expect(sent[0]!.params).toEqual(['Amit', 'Monday']);
  });

  it('defaults to English when no language was stored', async () => {
    const { ctx, sent } = ctxFor({ templateName: 'demo_reminder' });
    await templateHandler.run(ctx as never);
    expect(sent[0]!.language).toBe('en');
  });

  // A half-configured step should not strand a customer mid-conversation.
  it('sends nothing and carries on when no template is chosen', async () => {
    const { ctx, sent } = ctxFor({ templateName: '' });
    const r = await templateHandler.run(ctx as never);
    expect(sent).toEqual([]);
    expect(r.outcome).toEqual({ next: 'edge' });
  });

  it('reports which variables its blanks read', () => {
    expect(templateHandler.describe!({ bodyParams: ['{{name}}', '{{day}}', 'fixed'] }))
      .toEqual({ readsVars: ['name', 'day'] });
  });
});

describe('the editor and the 24-hour window', () => {
  const n = (id: string, type: string, data: Record<string, unknown> = {}) => ({ id, type, data });
  const e = (source: string, target: string) => ({ source, target });

  // This is the whole reason the step exists.
  it('stops warning about a long wait once a template follows it', () => {
    const nodes = [
      n('s', 'start'),
      n('w', 'wait', { mode: 'duration', days: 2 }),
      n('t', 'template', { templateName: 'demo_reminder' }),
      n('end', 'end', { message: '' }),
    ];
    const kinds = validateFlow(nodes, [e('s', 'w'), e('w', 't'), e('t', 'end')]).map((x) => x.kind);
    expect(kinds).not.toContain('wait_past_the_window');
  });

  it('still warns when a long wait is followed by a plain message', () => {
    const nodes = [
      n('s', 'start'),
      n('w', 'wait', { mode: 'duration', days: 2 }),
      n('m', 'message', { message: 'Still interested?' }),
      n('end', 'end', { message: '' }),
    ];
    const kinds = validateFlow(nodes, [e('s', 'w'), e('w', 'm'), e('m', 'end')]).map((x) => x.kind);
    expect(kinds).toContain('wait_past_the_window');
  });

  it('warns when a template step has no template chosen', () => {
    const nodes = [n('s', 'start'), n('t', 'template', { templateName: '' }), n('end', 'end', { message: '' })];
    const kinds = validateFlow(nodes, [e('s', 't'), e('t', 'end')]).map((x) => x.kind);
    expect(kinds).toContain('template_not_chosen');
  });
});

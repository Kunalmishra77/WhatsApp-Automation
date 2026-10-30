// lib/flow-nodes/webhook.ts
//
// The step that lets a flow reach something this platform has never heard of.
//
// Every other node does one named thing. This one posts what the flow has
// collected to a URL the client controls and, optionally, reads values back
// into the flow. That is how a client connects their own CRM, their billing
// system, a Google Sheet, an availability checker — without any of it being
// built in here.
//
// It is also how the flow lead export stops being special. That was a fixed
// payload of one client's field names, hard-coded into the engine; a Webhook
// step does the same job for any workspace, with the fields that workspace
// actually asked for.
//
// Two branches, because an outside system is the one thing in a flow that is
// not under anyone's control here: `ok` and `failed`. A flow that assumed the
// call worked would strand a customer the first time someone's server was down.

import type { NodeHandler } from './types';
import { placeholdersIn } from './pure';

export interface WebhookNodeData {
  label?: string;
  url?: string;
  method?: 'POST' | 'GET';
  /** Sent as JSON. Values may be flow placeholders like {{name}}. */
  body?: Array<{ key: string; value: string }>;
  /** Reads fields out of the JSON response into flow variables. */
  saveFrom?: Array<{ responseKey: string; saveAs: string }>;
  /** Seconds to wait before giving up. Default 10, capped at 30. */
  timeoutSeconds?: number;
}

/**
 * Whether this URL is safe for the server to call on a client's behalf.
 *
 * The step takes a URL from whoever edits the flow and the call is made from
 * inside our network, which is the shape of a server-side request forgery. A
 * workspace pointing it at 169.254.169.254 would be reading the host's cloud
 * credentials; one pointing it at localhost would be reaching our own services
 * with none of the usual authentication in front of them.
 *
 * Hostname checks do not stop a name that resolves to a private address after
 * this runs. They do stop every case anyone reaches by accident and the
 * obvious deliberate ones, which is worth having while the harder fix — making
 * the call from somewhere with no private network to reach — is not available.
 */
export function isSafeWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return false;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 0 || a === 10) return false;          // loopback, this-host, private
    if (a === 169 && b === 254) return false;                     // link-local, incl. cloud metadata
    if (a === 192 && b === 168) return false;                     // private
    if (a === 172 && b >= 16 && b <= 31) return false;            // private
    if (a >= 224) return false;                                   // multicast and reserved
  }

  return true;
}

const DEFAULT_TIMEOUT = 10;
const MAX_TIMEOUT = 30;

/** Reads `a.b.c` out of a parsed JSON response. */
export function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

export const webhookHandler: NodeHandler = {
  type: 'webhook',

  handles: () => ['ok', 'failed'],

  async run(ctx) {
    const d = ctx.node.data as WebhookNodeData;
    if (!d.url?.trim()) {
      // Nothing to call. The editor warns about this; at run time the flow
      // takes the failure branch rather than pretending it succeeded.
      return { outcome: { next: 'edge', handle: 'failed' } };
    }

    const payload: Record<string, string> = {};
    for (const { key, value } of d.body ?? []) {
      if (key?.trim()) payload[key.trim()] = ctx.interpolate(value ?? '');
    }

    const seconds = Math.min(
      typeof d.timeoutSeconds === 'number' && d.timeoutSeconds > 0 ? d.timeoutSeconds : DEFAULT_TIMEOUT,
      MAX_TIMEOUT,
    );

    const target = ctx.interpolate(d.url);
    if (!isSafeWebhookUrl(target)) {
      console.error(`[FlowWebhook] refused to call ${target}`);
      return { outcome: { next: 'edge', handle: 'failed' } };
    }

    const result = await ctx.ops.callWebhook({
      url: target,
      method: d.method ?? 'POST',
      payload,
      timeoutSeconds: seconds,
    });

    if (!result.ok) {
      return { outcome: { next: 'edge', handle: 'failed' } };
    }

    // Only the fields the author asked for are taken, and only as text, so a
    // nested object or an unexpected shape cannot end up interpolated into a
    // message as "[object Object]".
    const setVars: Record<string, string | number> = {};
    for (const { responseKey, saveAs } of d.saveFrom ?? []) {
      if (!responseKey?.trim() || !saveAs?.trim()) continue;
      const value = readPath(result.data, responseKey.trim());
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') continue;
      const text = String(value);
      setVars[saveAs.trim()] = Number.isFinite(Number(text)) ? Number(text) : 0;
      setVars[`${saveAs.trim()}_text`] = text;
    }

    return { outcome: { next: 'edge', handle: 'ok' }, setVars };
  },

  describe(data) {
    const d = data as WebhookNodeData;
    const reads = [
      ...placeholdersIn(d.url),
      ...(d.body ?? []).flatMap((b) => placeholdersIn(b.value)),
    ];
    return {
      readsVars: [...new Set(reads)],
      writesVars: (d.saveFrom ?? []).map((s) => s.saveAs).filter(Boolean),
    };
  },
};

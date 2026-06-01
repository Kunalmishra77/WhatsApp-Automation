import { createAdminClient } from '@/services/supabase/admin';
import { checkWebhookLimit } from '@/lib/rate-limit';

export type WebhookEvent =
  | 'message.received'
  | 'conversation.created'
  | 'conversation.resolved'
  | 'contact.created'
  | 'campaign.completed';

export interface WebhookPayload {
  event: WebhookEvent;
  workspace_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

async function signPayload(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return 'sha256=' + Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function dispatchWebhookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const db = createAdminClient() as any;

  // Fetch active endpoints subscribed to this event
  const { data: endpoints } = await db
    .from('webhook_endpoints')
    .select('id, url, secret')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .contains('events', [event]);

  if (!endpoints || endpoints.length === 0) return;

  // Rate limit: max 100 webhook dispatches per minute per workspace
  const allowed = await checkWebhookLimit(workspaceId);
  if (!allowed) {
    console.warn(`[Webhook] Rate limited for workspace ${workspaceId}`);
    return;
  }

  const payload: WebhookPayload = {
    event,
    workspace_id: workspaceId,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);

  await Promise.allSettled(
    endpoints.map((ep: { id: string; url: string; secret?: string }) =>
      deliverWebhook(db, ep, event, body, payload),
    ),
  );
}

async function deliverWebhook(
  db: any,
  endpoint: { id: string; url: string; secret?: string },
  event: WebhookEvent,
  body: string,
  payload: WebhookPayload,
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Agentix-Event': event,
    'X-Agentix-Delivery': crypto.randomUUID(),
    'User-Agent': 'Agentix-Webhooks/1.0',
  };

  if (endpoint.secret) {
    headers['X-Agentix-Signature'] = await signPayload(endpoint.secret, body);
  }

  let statusCode: number | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });
    statusCode = res.status;
    success = res.ok;
    if (!res.ok) errorMessage = `HTTP ${res.status}`;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Delivery failed';
  }

  // Log delivery result (fire-and-forget)
  void db.from('webhook_deliveries').insert({
    endpoint_id:  endpoint.id,
    workspace_id: payload.workspace_id,
    event,
    payload,
    status_code:  statusCode,
    success,
    error_message: errorMessage,
  });

  // Update endpoint last_triggered_at and failure_count
  const update: Record<string, unknown> = { last_triggered_at: new Date().toISOString() };
  if (!success) update.failure_count = db.rpc ? undefined : undefined; // increment handled below
  await db
    .from('webhook_endpoints')
    .update(update)
    .eq('id', endpoint.id);

  if (!success) {
    await db.rpc('increment_webhook_failures', { endpoint_id: endpoint.id }).maybeSingle();
  }
}

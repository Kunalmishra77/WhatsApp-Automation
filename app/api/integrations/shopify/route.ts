import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

export const maxDuration = 30;

// Verify Shopify HMAC signature
async function verifyShopifyWebhook(request: NextRequest, secret: string): Promise<{ valid: boolean; body: string }> {
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256') ?? '';
  const body = await request.text();

  if (!hmacHeader || !secret) return { valid: false, body };

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return { valid: expected === hmacHeader, body };
}

function buildOrderMessage(event: string, order: Record<string, unknown>): string {
  const name    = (order.customer as Record<string, unknown> | null)?.first_name ?? 'Customer';
  const orderNo = order.order_number ?? order.name ?? '#?';
  const total   = order.total_price ?? '0';
  const currency = order.currency ?? 'INR';

  switch (event) {
    case 'orders/create':
      return `Hello ${name as string}! 🛍️\n\nYour order ${orderNo as string} has been placed successfully!\nTotal: ${currency as string} ${total as string}\n\nThank you for shopping with us! We'll send you an update once it's shipped.`;
    case 'orders/fulfilled':
    case 'orders/updated': {
      const tracking = (order.fulfillments as Array<Record<string, unknown>> | null)?.[0];
      const trackNum = tracking?.tracking_number;
      const trackUrl = tracking?.tracking_url;
      let msg = `📦 Great news, ${name as string}!\n\nYour order ${orderNo as string} has been shipped!`;
      if (trackNum) msg += `\nTracking: ${trackNum as string}`;
      if (trackUrl) msg += `\nTrack here: ${trackUrl as string}`;
      return msg;
    }
    case 'orders/cancelled':
      return `Hello ${name as string}, your order ${orderNo as string} has been cancelled. If this was a mistake, please contact us.`;
    case 'orders/paid':
      return `✅ Payment confirmed for order ${orderNo as string}! Amount: ${currency as string} ${total as string}. Thank you!`;
    case 'checkouts/create':
    case 'carts/create':
      return `Hi ${name as string}! 🛒 You left some items in your cart. Complete your purchase before they sell out! Reply to this message if you need help.`;
    default:
      return `Update for your order ${orderNo as string} from our store.`;
  }
}

// POST /api/integrations/shopify?workspaceId=
export async function POST(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

  const topic = request.headers.get('x-shopify-topic') ?? '';

  const db = createAdminClient() as any;

  // Get workspace + Shopify secret
  const { data: ws } = await db
    .from('workspaces')
    .select('phone_number_id, access_token, settings')
    .eq('id', workspaceId)
    .single();

  if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  const shopifySecret = (ws.settings as Record<string, unknown> | null)?.shopify_webhook_secret as string | undefined;

  // Verify signature if secret configured
  const { valid, body } = await verifyShopifyWebhook(request, shopifySecret ?? '');
  if (shopifySecret && !valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ ok: true }); }

  // Extract phone from customer
  const customer = payload.customer as Record<string, unknown> | null;
  const phone = (customer?.phone as string | null)
    ?? (payload.shipping_address as Record<string, unknown> | null)?.phone as string | null
    ?? null;

  if (!phone || !ws.phone_number_id || !ws.access_token) {
    return NextResponse.json({ ok: true, skipped: 'no phone or WhatsApp not configured' });
  }

  const token   = (ws.access_token as string).replace(/﻿/g, '').trim();
  const message = buildOrderMessage(topic, payload);

  // Send WhatsApp message
  await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id as string}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', recipient_type: 'individual',
      to: phone, type: 'text', text: { preview_url: false, body: message },
    }),
  }).catch((err) => console.error('[Shopify] WhatsApp send failed:', err));

  // Log activity
  void db.from('activities').insert({
    workspace_id: workspaceId,
    entity_type:  'shopify_order',
    entity_id:    payload.id ?? crypto.randomUUID(),
    action:       topic,
    metadata:     { order_number: payload.order_number, phone, topic },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { normalizePhone } from '@/lib/phone';

export const maxDuration = 30;

async function verifyShopifyWebhook(request: NextRequest, secret: string): Promise<{ valid: boolean; body: string }> {
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256') ?? '';
  const body = await request.text();
  if (!hmacHeader || !secret) return { valid: false, body };
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return { valid: expected === hmacHeader, body };
}

function buildOrderMessage(
  event: string,
  order: Record<string, unknown>,
  customMessage?: string,
): string {
  const customer = order.customer as Record<string, unknown> | null;
  const name     = (customer?.first_name as string | null) ?? 'Customer';
  const orderNo  = (order.order_number ?? order.name ?? '#?') as string;
  const total    = (order.total_price ?? '0') as string;
  const currency = (order.currency ?? 'INR') as string;

  // Use custom message template if provided (supports {{name}}, {{order_no}}, {{total}})
  if (customMessage) {
    return customMessage
      .replace(/\{\{name\}\}/gi, name)
      .replace(/\{\{order_no\}\}/gi, orderNo)
      .replace(/\{\{total\}\}/gi, `${currency} ${total}`);
  }

  switch (event) {
    case 'orders/create':
      return `Hello ${name}! 🛍️\n\nYour order *${orderNo}* has been placed successfully!\nTotal: *${currency} ${total}*\n\nThank you for shopping with us! We'll send you an update once it's shipped.`;
    case 'orders/fulfilled':
    case 'orders/updated': {
      const fulfillment = (order.fulfillments as Array<Record<string, unknown>> | null)?.[0];
      const trackNum = fulfillment?.tracking_number as string | null;
      const trackUrl = fulfillment?.tracking_url as string | null;
      let msg = `📦 Great news, ${name}!\n\nYour order *${orderNo}* has been shipped!`;
      if (trackNum) msg += `\nTracking: ${trackNum}`;
      if (trackUrl) msg += `\n${trackUrl}`;
      return msg;
    }
    case 'orders/cancelled':
      return `Hello ${name}, your order *${orderNo}* has been cancelled. If this was a mistake, please contact us.`;
    case 'orders/paid':
      return `✅ Payment confirmed for order *${orderNo}*!\nAmount: *${currency} ${total}*\n\nThank you!`;
    case 'checkouts/create':
    case 'carts/create':
      return `Hi ${name}! 🛒 You left some items in your cart.\n\nComplete your purchase before they sell out! Reply to this message if you need help.`;
    default:
      return `Update for your order *${orderNo}* from our store.`;
  }
}

function mapShopifyToOrderStatus(topic: string): string {
  switch (topic) {
    case 'orders/create': return 'confirmed';
    case 'orders/paid':   return 'confirmed';
    case 'orders/fulfilled': return 'shipped';
    case 'orders/cancelled': return 'cancelled';
    default: return 'confirmed';
  }
}

// POST /api/integrations/shopify?workspaceId=
export async function POST(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

  const topic = request.headers.get('x-shopify-topic') ?? '';
  const db    = createAdminClient() as any;

  const { data: ws } = await db
    .from('workspaces')
    .select('phone_number_id, access_token, settings')
    .eq('id', workspaceId)
    .single();

  if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  const settings       = (ws.settings as Record<string, unknown> | null) ?? {};
  const shopifySecret  = settings.shopify_webhook_secret as string | undefined;
  const shopifyEvents  = (settings.shopify_events as Record<string, boolean>) ?? {};
  const shopifyMsgs    = (settings.shopify_messages as Record<string, string>) ?? {};

  // Verify HMAC
  const { valid, body } = await verifyShopifyWebhook(request, shopifySecret ?? '');
  if (shopifySecret && !valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ ok: true }); }

  // Check if this event is enabled (default: enabled)
  const eventKey = topic.replace('/', '_');
  if (shopifyEvents[eventKey] === false) {
    return NextResponse.json({ ok: true, skipped: `event ${topic} disabled` });
  }

  // ── Extract customer info ────────────────────────────────────────────────
  const customer      = payload.customer as Record<string, unknown> | null;
  const rawPhone      = (customer?.phone as string | null)
    ?? (payload.shipping_address as Record<string, unknown> | null)?.phone as string | null
    ?? (payload.billing_address as Record<string, unknown> | null)?.phone as string | null;

  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || null;
  const customerEmail = (customer?.email as string | null) ?? null;

  // ── Upsert contact ───────────────────────────────────────────────────────
  let contactId: string | null = null;
  if (phone) {
    const { data: upserted } = await db
      .from('contacts')
      .upsert({
        workspace_id: workspaceId,
        phone,
        name:         customerName,
        email:        customerEmail,
        tags:         ['shopify-customer'],
      }, { onConflict: 'workspace_id,phone', ignoreDuplicates: false })
      .select('id')
      .single();
    contactId = upserted?.id ?? null;
  }

  // ── Upsert order ─────────────────────────────────────────────────────────
  const orderRef    = String(payload.order_number ?? payload.id ?? payload.token ?? crypto.randomUUID());
  const orderStatus = mapShopifyToOrderStatus(topic);
  const totalAmount = parseFloat(payload.total_price as string ?? '0') || null;
  const currency    = (payload.currency as string | null) ?? 'INR';

  if (topic.startsWith('orders/') && orderRef) {
    const lineItems = (payload.line_items as Array<Record<string, unknown>> | null) ?? [];
    const itemsSummary = lineItems.map(i => `${i.quantity}x ${i.name as string}`).join(', ');

    const fulfillment = (payload.fulfillments as Array<Record<string, unknown>> | null)?.[0];
    const trackingNum = fulfillment?.tracking_number as string | null;
    const trackingUrl = fulfillment?.tracking_url  as string | null;

    await db
      .from('orders')
      .upsert({
        workspace_id:   workspaceId,
        contact_id:     contactId,
        order_ref:      orderRef,
        status:         orderStatus,
        customer_name:  customerName,
        items_summary:  itemsSummary || null,
        total_amount:   totalAmount,
        currency,
        notes: trackingNum ? `Tracking: ${trackingNum}${trackingUrl ? ' — ' + trackingUrl : ''}` : null,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'workspace_id,order_ref' })
      .catch((err: unknown) => console.error('[Shopify] Order upsert failed:', err));
  }

  // ── Send WhatsApp notification ───────────────────────────────────────────
  if (!phone || !ws.phone_number_id || !ws.access_token) {
    return NextResponse.json({ ok: true, skipped: 'no phone or WA credentials' });
  }

  const token   = (ws.access_token as string).replace(/﻿/g, '').trim();
  const message = buildOrderMessage(topic, payload, shopifyMsgs[eventKey]);

  await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id as string}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: message },
    }),
  }).catch((err: unknown) => console.error('[Shopify] WhatsApp send failed:', err));

  return NextResponse.json({ ok: true, contact_id: contactId });
}

import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/services/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

// POST /api/payments/webhook?workspaceId=<tenant workspace id>
//
// Per-tenant Razorpay webhook. Each tenant registers this URL in THEIR OWN
// Razorpay dashboard and sets a webhook secret (workspaces.settings
// .razorpay_webhook_secret). We verify the signature with that PER-TENANT
// secret — never the platform RAZORPAY_WEBHOOK_SECRET used for SaaS billing.
//
// On a paid payment link we flip the originating conversation message to paid,
// post a confirmation into the thread and mark any associated (tenant-customer)
// order confirmed. This NEVER touches our platform subscriptions / payments /
// billing tables — tenant-customer money is strictly separate from SaaS billing.
// Fail-open: a verified event we can't process returns 200 (logged) so Razorpay
// doesn't retry forever. Only a missing workspaceId (400) or bad signature (401)
// is rejected.

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const clean = signature.trim();
  if (!clean) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(clean);
  try {
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function formatAmount(amount: number, currency: string): string {
  const rounded = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return currency === 'INR' ? `₹${rounded}` : `${currency} ${rounded}`;
}

export async function POST(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  // Raw body BEFORE JSON.parse — the HMAC is computed over the exact bytes Razorpay sent.
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';

  const db = createAdminClient() as any;

  // Load THIS tenant's own webhook secret (per-tenant, not the platform secret).
  const { data: ws } = await db
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .maybeSingle();
  const secret = (ws?.settings as Record<string, unknown> | undefined)?.razorpay_webhook_secret as
    | string
    | undefined;

  if (!secret) {
    console.error('[PaymentsWebhook] no razorpay_webhook_secret configured for workspace', workspaceId);
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });
  }

  if (!verifySignature(rawBody, signature, secret)) {
    console.error('[PaymentsWebhook] invalid signature for workspace', workspaceId);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // From here on: always 200. The signature is valid; retries won't fix a
  // payload/state problem, and idempotency is guarded on metadata.paid below.
  let parsed: { event?: string; payload?: Record<string, any> };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: 'ignored', reason: 'invalid_json' });
  }

  try {
    await handlePaidEvent(db, workspaceId, parsed.event ?? '', parsed.payload ?? {});
  } catch (e) {
    console.error('[PaymentsWebhook] handler error (fail-open):', e);
  }

  return NextResponse.json({ status: 'ok' });
}

async function handlePaidEvent(
  db: any,
  workspaceId: string,
  event: string,
  payload: Record<string, any>,
): Promise<void> {
  const plinkEntity = payload?.payment_link?.entity;
  const paymentEntity = payload?.payment?.entity;

  // The payment_link id is what we stored as metadata.razorpay_id when the link was sent.
  const linkId: string | undefined =
    plinkEntity?.id ??
    paymentEntity?.payment_link_id ??
    paymentEntity?.notes?.payment_link_id;

  const isPaid = event === 'payment_link.paid' || (event === 'payment.captured' && !!linkId);
  if (!isPaid) {
    console.log('[PaymentsWebhook] ignoring event', event);
    return;
  }
  if (!linkId) {
    console.error('[PaymentsWebhook] paid event without a payment_link id', event);
    return;
  }

  // Find the originating message (workspace-scoped) via metadata.razorpay_id.
  const { data: msgRow } = await db
    .from('messages')
    .select('id, conversation_id, metadata')
    .eq('workspace_id', workspaceId)
    .eq('metadata->>razorpay_id', linkId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!msgRow) {
    console.error('[PaymentsWebhook] no message found for payment_link', linkId, 'workspace', workspaceId);
    return;
  }

  const metadata = (msgRow.metadata ?? {}) as Record<string, unknown>;

  // Idempotency: keyed on this payment link — if it's already paid, this is a
  // duplicate delivery (e.g. payment.captured + payment_link.paid both firing).
  if (metadata.paid === true) {
    console.log('[PaymentsWebhook] payment_link already marked paid — duplicate', linkId);
    return;
  }

  // Amount: prefer the value we stored when creating the link (rupees);
  // fall back to the payload amount (paise → rupees).
  const paise = Number(plinkEntity?.amount_paid ?? plinkEntity?.amount ?? paymentEntity?.amount);
  const storedAmount = typeof metadata.amount === 'number' ? (metadata.amount as number) : undefined;
  const amount = storedAmount ?? (Number.isFinite(paise) ? paise / 100 : 0);
  const currency =
    (typeof metadata.currency === 'string' ? (metadata.currency as string) : undefined) ??
    plinkEntity?.currency ??
    paymentEntity?.currency ??
    'INR';
  const paidAt = new Date().toISOString();

  // Mark the originating message paid.
  await db
    .from('messages')
    .update({
      metadata: {
        ...metadata,
        paid: true,
        paid_at: paidAt,
        razorpay_payment_id: paymentEntity?.id ?? null,
      },
    })
    .eq('id', msgRow.id)
    .eq('workspace_id', workspaceId);

  // Post a confirmation into the thread + mark any associated order confirmed.
  const confirmLine = `Payment received ✅ ${formatAmount(amount, currency)}`;
  if (msgRow.conversation_id) {
    await db.from('messages').insert({
      conversation_id: msgRow.conversation_id,
      workspace_id:    workspaceId,
      sender_type:     'system',
      sender_id:       null,
      direction:       'outbound',
      type:            'internal_note',
      content:         confirmLine,
      status:          'delivered',
      metadata: {
        razorpay_id:         linkId,
        razorpay_payment_id: paymentEntity?.id ?? null,
        amount,
        currency,
        paid_at:             paidAt,
      } as Record<string, unknown>,
    });

    await db
      .from('conversations')
      .update({ last_message: confirmLine, last_message_at: paidAt })
      .eq('id', msgRow.conversation_id);

    // Tenant-customer order (from the inbound-order handler) — advance to 'confirmed'
    // ONLY when it's unambiguous: exactly one pending order on this conversation.
    // Payment links carry no order-id linkage, so with 0 or >1 pending orders we leave
    // them for the agent to confirm manually (the "Payment received" note above already
    // surfaces the payment) rather than risk marking the wrong order paid. Strictly the
    // tenant's own orders table; never SaaS billing.
    const { data: pendingOrders } = await db
      .from('orders')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('conversation_id', msgRow.conversation_id)
      .eq('status', 'pending');
    if (pendingOrders?.length === 1) {
      await db
        .from('orders')
        .update({ status: 'confirmed', updated_at: paidAt })
        .eq('id', pendingOrders[0].id)
        .eq('workspace_id', workspaceId);
    } else if ((pendingOrders?.length ?? 0) > 1) {
      console.log('[PaymentsWebhook] multiple pending orders on conversation', msgRow.conversation_id, '— not auto-confirming (ambiguous)');
    }
  }

  console.log('[PaymentsWebhook] payment_link marked paid', linkId, 'workspace', workspaceId);
}

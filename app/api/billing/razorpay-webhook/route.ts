import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { getRequiredSecret } from '@/lib/supabase-env';
import { verifyWebhookSignature, computeAmounts, addMonths, monthsForTerm, formatInvoiceNo, type Term } from '@/lib/billing';
import { sendMail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/billing/razorpay-webhook
// Source of truth for subscription/payment state. Idempotent (via
// billing_webhook_events keyed on the x-razorpay-event-id header) and
// signature-verified (before any DB work). Always 200 on handled/ignored
// events so Razorpay doesn't retry needlessly — only a bad signature is 400.

interface SubscriptionRow {
  id: string;
  workspace_id: string;
  plan_key: string;
  status: string;
  term: Term;
  current_period_end: string | null;
}

interface WorkspaceContactRow {
  owner_email: string | null;
  name: string;
}

/**
 * Thrown when a CRITICAL state write (subscriptions.status/period or
 * workspaces.is_active/subscription_status) fails. Caught in POST(), which
 * removes the idempotency row for this event_id and returns 500 so
 * Razorpay's retry reprocesses cleanly instead of deduping to a no-op 200.
 */
class CriticalWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CriticalWriteError';
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  const eventId = request.headers.get('x-razorpay-event-id') ?? '';

  let webhookSecret: string;
  try {
    webhookSecret = getRequiredSecret('RAZORPAY_WEBHOOK_SECRET');
  } catch (err) {
    console.error('[RazorpayWebhook] missing RAZORPAY_WEBHOOK_SECRET', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    console.error('[RazorpayWebhook] invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // From here on: always 200, even on unprocessable input — Razorpay only
  // needs the retry signal for a bad signature.
  let parsed: { event: string; payload: Record<string, any> };
  try {
    parsed = JSON.parse(rawBody);
  } catch (err) {
    console.error('[RazorpayWebhook] invalid JSON body', err);
    return NextResponse.json({ status: 'ignored', reason: 'invalid_json' });
  }

  if (!eventId) {
    console.error('[RazorpayWebhook] missing x-razorpay-event-id header, cannot guarantee idempotency', parsed.event);
    return NextResponse.json({ status: 'ignored', reason: 'missing_event_id' });
  }

  try {
    const db = createAdminClient() as any;

    // Idempotency: unique-key insert, do-nothing on conflict. 0 rows back = duplicate delivery.
    const { data: inserted, error: idemError } = await db
      .from('billing_webhook_events')
      .upsert(
        { event_id: eventId, event_type: parsed.event, payload: parsed.payload },
        { onConflict: 'event_id', ignoreDuplicates: true },
      )
      .select('event_id');

    if (idemError) {
      console.error('[RazorpayWebhook] idempotency insert failed', idemError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!inserted || inserted.length === 0) {
      return NextResponse.json({ status: 'duplicate' });
    }

    try {
      await dispatchEvent(db, parsed.event, parsed.payload ?? {});
    } catch (err) {
      if (err instanceof CriticalWriteError) {
        // Compensating delete: without this, Razorpay's retry would be
        // deduped to a 200 no-op and the transition would never apply.
        const { error: delErr } = await db
          .from('billing_webhook_events')
          .delete()
          .eq('event_id', eventId);
        if (delErr) {
          console.error(
            '[RazorpayWebhook] CRITICAL: failed to remove idempotency row after failed write — retry will be a no-op',
            delErr.message,
          );
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      // Non-critical per-event failure: log and still 200 — Razorpay retrying
      // won't fix a bug in our handler, and event_id is already recorded.
      console.error(`[RazorpayWebhook] handler error for event ${parsed.event}`, err);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[RazorpayWebhook]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function dispatchEvent(db: any, event: string, payload: Record<string, any>): Promise<void> {
  switch (event) {
    case 'subscription.activated':
    case 'subscription.charged':
      await handleSubscriptionActivatedOrCharged(db, event, payload);
      break;
    case 'subscription.pending':
      await handleSubscriptionPending(db, payload);
      break;
    case 'subscription.halted':
      await handleSubscriptionHalted(db, payload);
      break;
    case 'subscription.cancelled':
      await handleSubscriptionCancelled(db, payload);
      break;
    case 'payment.captured':
    case 'order.paid':
      await handlePaymentCapturedOrOrderPaid(db, payload);
      break;
    case 'payment.failed':
      await handlePaymentFailed(db, payload);
      break;
    case 'refund.processed':
      await handleRefundProcessed(db, payload);
      break;
    default:
      console.log('[RazorpayWebhook] unhandled event, ignoring', event);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function epochToDate(epoch: unknown): string | null {
  if (typeof epoch !== 'number' || !Number.isFinite(epoch)) return null;
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function findSubscriptionByRzpId(db: any, rzpSubscriptionId: string): Promise<SubscriptionRow | null> {
  const { data } = await db
    .from('subscriptions')
    .select('id, workspace_id, plan_key, status, term, current_period_end')
    .eq('razorpay_subscription_id', rzpSubscriptionId)
    .maybeSingle();
  return (data as SubscriptionRow | null) ?? null;
}

async function findWorkspaceContact(db: any, workspaceId: string): Promise<WorkspaceContactRow | null> {
  const { data } = await db
    .from('workspaces')
    .select('owner_email, name')
    .eq('id', workspaceId)
    .maybeSingle();
  return (data as WorkspaceContactRow | null) ?? null;
}

/** Next unused invoice number for `year`, offset by `attempt` to dodge a raced candidate. */
async function nextInvoiceCandidate(db: any, year: number, attempt: number): Promise<string> {
  const { count } = await db
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .not('invoice_no', 'is', null);
  return formatInvoiceNo((count ?? 0) + 1 + attempt, year);
}

// ─── event handlers ─────────────────────────────────────────────────────

async function handleSubscriptionActivatedOrCharged(
  db: any,
  event: 'subscription.activated' | 'subscription.charged',
  payload: Record<string, any>,
): Promise<void> {
  const subEntity = payload?.subscription?.entity;
  const rzpSubscriptionId: string | undefined = subEntity?.id;
  if (!rzpSubscriptionId) {
    console.error(`[RazorpayWebhook] ${event}: no subscription.entity.id in payload`);
    return;
  }

  const subRow = await findSubscriptionByRzpId(db, rzpSubscriptionId);
  if (!subRow) {
    console.error(`[RazorpayWebhook] ${event}: no subscriptions row for razorpay_subscription_id`, rzpSubscriptionId);
    return;
  }

  const today = todayStr();
  const termMonths = monthsForTerm(subRow.term ?? 'monthly');
  // 'charged' is a renewal: extend from the subscription's existing period end
  // (fallback to today if it's somehow unset). 'activated' is the first cycle,
  // which always starts today.
  const baseDate = event === 'subscription.charged' ? (subRow.current_period_end ?? today) : today;
  const periodStart = epochToDate(subEntity.current_start) ?? baseDate;
  const periodEnd = epochToDate(subEntity.current_end) ?? addMonths(baseDate, termMonths);

  const { error: subErr } = await db
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      grace_until: null,
      reminder_sent_for: null,
    })
    .eq('id', subRow.id);
  if (subErr) {
    console.error(`[RazorpayWebhook] CRITICAL: failed to apply ${event} for workspace ${subRow.workspace_id}:`, subErr.message);
    throw new CriticalWriteError(`subscriptions update failed for ${event}`);
  }

  const { error: wsErr } = await db
    .from('workspaces')
    .update({ is_active: true, subscription_status: 'active' })
    .eq('id', subRow.workspace_id);
  if (wsErr) {
    console.error(`[RazorpayWebhook] CRITICAL: failed to apply ${event} for workspace ${subRow.workspace_id}:`, wsErr.message);
    throw new CriticalWriteError(`workspaces update failed for ${event}`);
  }

  if (event !== 'subscription.charged') return;

  const paymentEntity = payload?.payment?.entity;
  const rzpPaymentId: string | undefined = paymentEntity?.id;

  // Defensive de-dupe on top of the event_id uniqueness guard: never record
  // the same Razorpay payment twice even if this handler were re-entered.
  if (rzpPaymentId) {
    const { data: existing } = await db
      .from('payments')
      .select('id')
      .eq('razorpay_payment_id', rzpPaymentId)
      .maybeSingle();
    if (existing) return;
  }

  const { data: planRow } = await db
    .from('billing_plans')
    .select('base_paise')
    .eq('key', subRow.plan_key)
    .eq('term', subRow.term)
    .maybeSingle();

  if (!planRow) {
    // The charge really happened (subscription period + activation above
    // already applied) — but with no plan row we have no trustworthy amount
    // to ledger. Never write a ₹0 captured payment; skip the insert and
    // surface this loudly so it gets fixed (e.g. a renamed/deleted plan key/term).
    console.error(
      `[BillingWebhook] CRITICAL: plan ${subRow.plan_key}/${subRow.term} not found for workspace ${subRow.workspace_id} — skipping payment ledger insert`,
    );
    return;
  }

  // Amounts always come from the plan row, never trusted from the webhook payload.
  const { basePaise, gstPaise, totalPaise } = computeAmounts(planRow.base_paise);
  const paidAt = typeof paymentEntity?.created_at === 'number'
    ? new Date(paymentEntity.created_at * 1000).toISOString()
    : new Date().toISOString();

  const year = new Date().getUTCFullYear();
  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNo = await nextInvoiceCandidate(db, year, attempt);
    const { error } = await db.from('payments').insert({
      workspace_id: subRow.workspace_id,
      subscription_id: subRow.id,
      razorpay_payment_id: rzpPaymentId ?? null,
      razorpay_subscription_id: rzpSubscriptionId,
      invoice_no: invoiceNo,
      base_paise: basePaise,
      gst_paise: gstPaise,
      total_paise: totalPaise,
      gst_rate: 18,
      currency: 'INR',
      term: subRow.term,
      method: paymentEntity?.method ?? null,
      status: 'captured',
      period_start: periodStart,
      period_end: periodEnd,
      paid_at: paidAt,
    });
    if (!error) return;
    if (error.code !== '23505') {
      console.error('[RazorpayWebhook] subscription.charged: payments insert failed', error);
      return;
    }
    // 23505 (invoice_no unique clash) — retry with a bumped candidate.
  }
  console.error('[RazorpayWebhook] subscription.charged: failed to allocate invoice_no after retries', rzpSubscriptionId);
}

async function handleSubscriptionPending(db: any, payload: Record<string, any>): Promise<void> {
  const subEntity = payload?.subscription?.entity;
  const rzpSubscriptionId: string | undefined = subEntity?.id;
  if (!rzpSubscriptionId) {
    console.error('[RazorpayWebhook] subscription.pending: no subscription.entity.id in payload');
    return;
  }

  const subRow = await findSubscriptionByRzpId(db, rzpSubscriptionId);
  if (!subRow) {
    console.error('[RazorpayWebhook] subscription.pending: no subscriptions row for', rzpSubscriptionId);
    return;
  }

  const { data: configRow } = await db
    .from('billing_config')
    .select('grace_days')
    .eq('id', 1)
    .maybeSingle();
  const graceDays: number = configRow?.grace_days ?? 3;
  const graceUntil = addDaysStr(todayStr(), graceDays);

  const { error: subErr } = await db
    .from('subscriptions')
    .update({ status: 'past_due', grace_until: graceUntil })
    .eq('id', subRow.id);
  if (subErr) {
    console.error(`[RazorpayWebhook] CRITICAL: failed to apply subscription.pending for workspace ${subRow.workspace_id}:`, subErr.message);
    throw new CriticalWriteError('subscriptions update failed for subscription.pending');
  }

  // Email only after the state write has actually succeeded.
  const ws = await findWorkspaceContact(db, subRow.workspace_id);
  if (ws?.owner_email) {
    await sendMail({
      to: ws.owner_email,
      subject: 'Payment overdue — action required',
      html: `<p>Hi,</p><p>We were unable to process your Agentix subscription payment for <strong>${ws.name}</strong>. Please update your payment method within ${graceDays} day(s) to avoid service interruption.</p>`,
    });
  }
}

async function handleSubscriptionHalted(db: any, payload: Record<string, any>): Promise<void> {
  const subEntity = payload?.subscription?.entity;
  const rzpSubscriptionId: string | undefined = subEntity?.id;
  if (!rzpSubscriptionId) {
    console.error('[RazorpayWebhook] subscription.halted: no subscription.entity.id in payload');
    return;
  }

  const subRow = await findSubscriptionByRzpId(db, rzpSubscriptionId);
  if (!subRow) {
    console.error('[RazorpayWebhook] subscription.halted: no subscriptions row for', rzpSubscriptionId);
    return;
  }

  const { error: subErr } = await db.from('subscriptions').update({ status: 'suspended' }).eq('id', subRow.id);
  if (subErr) {
    console.error(`[RazorpayWebhook] CRITICAL: failed to apply subscription.halted for workspace ${subRow.workspace_id}:`, subErr.message);
    throw new CriticalWriteError('subscriptions update failed for subscription.halted');
  }

  // Data is preserved — only the access flag flips. No deletes anywhere in this handler.
  const { error: wsErr } = await db
    .from('workspaces')
    .update({ is_active: false, subscription_status: 'suspended' })
    .eq('id', subRow.workspace_id);
  if (wsErr) {
    console.error(`[RazorpayWebhook] CRITICAL: failed to apply subscription.halted for workspace ${subRow.workspace_id}:`, wsErr.message);
    throw new CriticalWriteError('workspaces update failed for subscription.halted');
  }

  // Email only after both state writes have actually succeeded.
  const ws = await findWorkspaceContact(db, subRow.workspace_id);
  if (ws?.owner_email) {
    await sendMail({
      to: ws.owner_email,
      subject: 'Subscription ended — pay to restart',
      html: `<p>Hi,</p><p>Your Agentix subscription for <strong>${ws.name}</strong> has ended after repeated failed payment attempts. Access has been paused and your data is safe. Make a payment to restart your subscription.</p>`,
    });
  }
}

async function handleSubscriptionCancelled(db: any, payload: Record<string, any>): Promise<void> {
  const subEntity = payload?.subscription?.entity;
  const rzpSubscriptionId: string | undefined = subEntity?.id;
  if (!rzpSubscriptionId) {
    console.error('[RazorpayWebhook] subscription.cancelled: no subscription.entity.id in payload');
    return;
  }

  const subRow = await findSubscriptionByRzpId(db, rzpSubscriptionId);
  if (!subRow) {
    console.error('[RazorpayWebhook] subscription.cancelled: no subscriptions row for', rzpSubscriptionId);
    return;
  }

  // Access continues until current_period_end; the billing-sweep cron (Task 6)
  // is what actually suspends once the period elapses.
  const { error: subErr } = await db
    .from('subscriptions')
    .update({ status: 'cancelled', cancel_at_period_end: true })
    .eq('id', subRow.id);
  if (subErr) {
    console.error(`[RazorpayWebhook] CRITICAL: failed to apply subscription.cancelled for workspace ${subRow.workspace_id}:`, subErr.message);
    throw new CriticalWriteError('subscriptions update failed for subscription.cancelled');
  }

  const { error: wsErr } = await db
    .from('workspaces')
    .update({ subscription_status: 'cancelled' })
    .eq('id', subRow.workspace_id);
  if (wsErr) {
    console.error(`[RazorpayWebhook] CRITICAL: failed to apply subscription.cancelled for workspace ${subRow.workspace_id}:`, wsErr.message);
    throw new CriticalWriteError('workspaces update failed for subscription.cancelled');
  }
}

async function handlePaymentCapturedOrOrderPaid(db: any, payload: Record<string, any>): Promise<void> {
  const paymentEntity = payload?.payment?.entity;
  const orderEntity = payload?.order?.entity;
  const orderId: string | undefined = paymentEntity?.order_id ?? orderEntity?.id;
  const notesWorkspaceId: string | undefined =
    paymentEntity?.notes?.workspace_id ?? orderEntity?.notes?.workspace_id;

  let paymentRow: { id: string; workspace_id: string; status: string } | null = null;
  if (orderId) {
    const { data } = await db
      .from('payments')
      .select('id, workspace_id, status')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();
    paymentRow = data ?? null;
  }

  if (paymentRow) {
    if (paymentRow.status !== 'captured') {
      // Non-critical write: has its own status='created' guard + 23505 retry
      // and already logs its own errors — no need to 500 on it.
      await captureExistingPayment(db, paymentRow.id, paymentEntity);
    }
    // Manual-path safety net: guarantee the workspace is active even if the
    // client-side /api/billing/verify call never completed.
    const { error: wsErr } = await db
      .from('workspaces')
      .update({ is_active: true, subscription_status: 'active' })
      .eq('id', paymentRow.workspace_id);
    if (wsErr) {
      console.error(`[RazorpayWebhook] CRITICAL: failed to apply payment.captured/order.paid for workspace ${paymentRow.workspace_id}:`, wsErr.message);
      throw new CriticalWriteError('workspaces update failed for payment.captured/order.paid');
    }
    return;
  }

  // No matching payments row (e.g. an auto-pay subscription charge, already
  // handled via subscription.charged) — fall back to notes.workspace_id
  // purely as an activation safety net.
  if (notesWorkspaceId) {
    const { error: wsErr } = await db
      .from('workspaces')
      .update({ is_active: true, subscription_status: 'active' })
      .eq('id', notesWorkspaceId);
    if (wsErr) {
      console.error(`[RazorpayWebhook] CRITICAL: failed to apply payment.captured/order.paid for workspace ${notesWorkspaceId}:`, wsErr.message);
      throw new CriticalWriteError('workspaces update failed for payment.captured/order.paid (notes fallback)');
    }
    return;
  }

  console.error('[RazorpayWebhook] payment.captured/order.paid: no matching payment row or notes.workspace_id', orderId);
}

async function captureExistingPayment(db: any, paymentId: string, paymentEntity: any): Promise<void> {
  const year = new Date().getUTCFullYear();
  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNo = await nextInvoiceCandidate(db, year, attempt);
    const { data: updated, error } = await db
      .from('payments')
      .update({
        status: 'captured',
        invoice_no: invoiceNo,
        razorpay_payment_id: paymentEntity?.id ?? null,
        method: paymentEntity?.method ?? null,
        paid_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .eq('status', 'created') // atomic guard — idempotent alongside /api/billing/verify
      .select('id');

    if (!error) {
      if (!updated || updated.length === 0) return; // already captured by verify route — no-op
      return;
    }
    if (error.code !== '23505') {
      console.error('[RazorpayWebhook] payment.captured: capture update failed', error);
      return;
    }
    // 23505 (invoice_no unique clash) — retry with a bumped candidate.
  }
  console.error('[RazorpayWebhook] payment.captured: failed to allocate invoice_no after retries', paymentId);
}

async function handlePaymentFailed(db: any, payload: Record<string, any>): Promise<void> {
  const paymentEntity = payload?.payment?.entity;
  const orderId: string | undefined = paymentEntity?.order_id;
  if (!orderId) {
    console.error('[RazorpayWebhook] payment.failed: no order_id in payload');
    return;
  }

  // No state change — only flip a still-pending payment row; never clobber
  // an already-captured/refunded row from a stale retry attempt.
  await db
    .from('payments')
    .update({ status: 'failed' })
    .eq('razorpay_order_id', orderId)
    .eq('status', 'created');
}

async function handleRefundProcessed(db: any, payload: Record<string, any>): Promise<void> {
  const paymentEntity = payload?.payment?.entity;
  const refundEntity = payload?.refund?.entity;
  const rzpPaymentId: string | undefined = paymentEntity?.id ?? refundEntity?.payment_id;
  if (!rzpPaymentId) {
    console.error('[RazorpayWebhook] refund.processed: no payment id in payload');
    return;
  }

  await db
    .from('payments')
    .update({ status: 'refunded' })
    .eq('razorpay_payment_id', rzpPaymentId)
    .eq('status', 'captured');
}

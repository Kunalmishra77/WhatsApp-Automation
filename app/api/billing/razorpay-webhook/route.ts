import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { verifyRazorpayWebhook, RAZORPAY_PLANS } from '@/lib/razorpay-billing';

// POST /api/billing/razorpay-webhook
// Razorpay Webhook handler for subscription events
export async function POST(request: NextRequest) {
  const body      = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';

  if (!verifyRazorpayWebhook(body, signature)) {
    console.error('[RazorpayWebhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event: string; payload: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const db = createAdminClient();

  const sub = (event.payload as any).subscription?.entity;
  const subscriptionId: string | undefined = sub?.id;
  const workspaceId: string | undefined = sub?.notes?.workspaceId;
  const planId: string | undefined = sub?.plan_id;

  if (!workspaceId) {
    return NextResponse.json({ received: true });
  }

  // Map planId → plan key
  const planKey = planId
    ? (Object.entries(RAZORPAY_PLANS).find(([, v]) => v.planId === planId)?.[0] ?? 'pro')
    : null;

  switch (event.event) {
    case 'subscription.activated': {
      const limits = planKey ? RAZORPAY_PLANS[planKey as keyof typeof RAZORPAY_PLANS].limits : RAZORPAY_PLANS.pro.limits;
      await (db as any).from('workspaces').update({
        plan: planKey ?? 'pro',
        plan_limits: limits,
        is_active: true,
        subscription_status: 'active',
        razorpay_subscription_id: subscriptionId ?? null,
        payment_failed_at: null,
      }).eq('id', workspaceId);
      break;
    }

    case 'subscription.charged': {
      // Payment success — restore access if it was halted
      const chargeAt = (event.payload as any).payment?.entity?.created_at;
      const nextBilling = chargeAt
        ? new Date((chargeAt + 30 * 24 * 3600) * 1000).toISOString().slice(0, 10)
        : null;
      await (db as any).from('workspaces').update({
        is_active: true,
        subscription_status: 'active',
        plan_expires_at: null,
        payment_failed_at: null,
        next_billing_date: nextBilling,
      }).eq('id', workspaceId);
      // Send payment success email
      await sendEmail(workspaceId, 'payment_success', db);
      break;
    }

    case 'subscription.payment.failed': {
      // Single attempt failed — Razorpay will retry. Just send a warning email.
      await sendEmail(workspaceId, 'payment_retry_warning', db);
      break;
    }

    case 'subscription.halted': {
      // All retries exhausted — block access
      await (db as any).from('workspaces').update({
        is_active: false,
        subscription_status: 'halted',
        payment_failed_at: new Date().toISOString(),
      }).eq('id', workspaceId);
      await sendEmail(workspaceId, 'payment_failed_final', db);
      break;
    }

    case 'subscription.cancelled':
    case 'subscription.completed': {
      await (db as any).from('workspaces').update({
        is_active: false,
        subscription_status: event.event === 'subscription.cancelled' ? 'cancelled' : 'expired',
        plan: 'free',
        plan_limits: RAZORPAY_PLANS.free.limits,
      }).eq('id', workspaceId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function sendEmail(
  workspaceId: string,
  type: 'payment_success' | 'payment_retry_warning' | 'payment_failed_final',
  db: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const { data: ws } = await (db as any).from('workspaces').select('owner_email, name').eq('id', workspaceId).single();
  if (!ws?.owner_email) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.agentix.in';

  const emails = {
    payment_success: {
      subject: '✅ Payment received — Agentix access restored',
      html: `<p>Hi,</p><p>Your Agentix subscription payment was received. Your access to <strong>${ws.name}</strong> has been fully restored.</p><p><a href="${appUrl}/conversations">Go to Dashboard →</a></p>`,
    },
    payment_retry_warning: {
      subject: '⚠️ Payment failed — Agentix will retry',
      html: `<p>Hi,</p><p>We could not process your Agentix subscription payment for <strong>${ws.name}</strong>. We will automatically retry in a few days.</p><p>Please ensure your payment method is up to date.</p>`,
    },
    payment_failed_final: {
      subject: '🚨 Subscription paused — Payment required',
      html: `<p>Hi,</p><p>We were unable to process your Agentix subscription payment after multiple attempts. Your access to <strong>${ws.name}</strong> has been <strong>temporarily paused</strong>.</p><p>Your data is safe. Please update your payment method to restore access:</p><p><a href="${appUrl}/payment-required">Restore Access →</a></p>`,
    },
  };

  const email = emails[type];
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Agentix <noreply@agentix.in>',
        to: [ws.owner_email],
        subject: email.subject,
        html: email.html,
      }),
    });
  } catch {
    // Non-fatal
  }
}

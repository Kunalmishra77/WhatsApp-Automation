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

  const db = createAdminClient() as any;

  // subscription.activated — payment successful, activate plan
  if (event.event === 'subscription.activated') {
    const sub = (event.payload as any).subscription?.entity;
    const workspaceId = sub?.notes?.workspaceId;
    const planId = sub?.plan_id;

    if (!workspaceId) return NextResponse.json({ received: true });

    // Map planId to plan key
    const planKey = Object.entries(RAZORPAY_PLANS).find(
      ([, v]) => v.planId === planId,
    )?.[0] ?? 'pro';

    const limits = RAZORPAY_PLANS[planKey as keyof typeof RAZORPAY_PLANS].limits;

    await db.from('workspaces').update({
      plan:        planKey,
      plan_limits: limits,
    }).eq('id', workspaceId);
  }

  // subscription.charged — recurring payment success
  if (event.event === 'subscription.charged') {
    const sub = (event.payload as any).subscription?.entity;
    const workspaceId = sub?.notes?.workspaceId;
    if (workspaceId) {
      // Extend plan — subscription still active
      await db.from('workspaces').update({
        plan_expires_at: null, // subscription-based, no expiry
      }).eq('id', workspaceId);
    }
  }

  // subscription.cancelled / subscription.completed — downgrade to free
  if (['subscription.cancelled', 'subscription.completed', 'subscription.halted'].includes(event.event)) {
    const sub = (event.payload as any).subscription?.entity;
    const workspaceId = sub?.notes?.workspaceId;
    if (workspaceId) {
      await db.from('workspaces').update({
        plan:        'free',
        plan_limits: RAZORPAY_PLANS.free.limits,
        stripe_subscription_id: null,
      }).eq('id', workspaceId);
    }
  }

  return NextResponse.json({ received: true });
}

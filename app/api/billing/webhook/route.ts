import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { STRIPE_PLANS, type PlanKey } from '@/lib/stripe';

// POST /api/billing/webhook — Stripe webhook handler
// Events handled: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });

  const body      = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  // Real Stripe HMAC-SHA256 verification (no SDK required)
  const parts: Record<string, string> = Object.fromEntries(
    signature.split(',').map((p) => { const [k, ...v] = p.split('='); return [k ?? '', v.join('=')]; }),
  );
  const ts   = parts['t'];
  const sig1 = parts['v1'];
  if (!ts || !sig1) return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
  if (Math.abs(Date.now() / 1000 - parseInt(ts, 10)) > 300) {
    return NextResponse.json({ error: 'Timestamp too old — possible replay attack' }, { status: 400 });
  }
  const enc       = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBytes  = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`${ts}.${body}`));
  const expected  = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected !== sig1) return NextResponse.json({ error: 'Signature mismatch' }, { status: 400 });

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const db = createAdminClient() as any;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const workspaceId  = (session.metadata as Record<string, string>)?.workspaceId;
    const customerId   = session.customer as string;
    const subscriptionId = session.subscription as string;

    if (!workspaceId) return NextResponse.json({ received: true });

    // Determine plan from line items (simple: store subscription_id, let portal handle it)
    const planFromMeta = (session.metadata as Record<string, string>)?.plan ?? 'pro';
    const validPlan = (['starter', 'pro', 'enterprise'] as const).includes(planFromMeta as 'starter' | 'pro' | 'enterprise')
      ? (planFromMeta as PlanKey)
      : 'pro';
    await db.from('workspaces').update({
      stripe_customer_id:      customerId,
      stripe_subscription_id:  subscriptionId,
      plan:                    validPlan,
      plan_expires_at:         null,
      plan_limits:             STRIPE_PLANS[validPlan]?.limits ?? STRIPE_PLANS.pro.limits,
    }).eq('id', workspaceId);
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const customerId = sub.customer as string;

    await db.from('workspaces').update({
      plan:                   'free',
      stripe_subscription_id: null,
      plan_limits:            STRIPE_PLANS.free.limits,
    }).eq('stripe_customer_id', customerId);
  }

  if (event.type === 'customer.subscription.updated') {
    const sub    = event.data.object;
    const status = sub.status as string;
    const customerId = sub.customer as string;

    if (status === 'active') {
      await db.from('workspaces').update({ plan: 'pro', plan_limits: STRIPE_PLANS.pro.limits })
        .eq('stripe_customer_id', customerId);
    } else if (['canceled', 'unpaid', 'past_due'].includes(status)) {
      await db.from('workspaces').update({ plan: 'free', plan_limits: STRIPE_PLANS.free.limits })
        .eq('stripe_customer_id', customerId);
    }
  }

  return NextResponse.json({ received: true });
}

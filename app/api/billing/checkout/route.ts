import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { createCheckoutSession, STRIPE_PLANS, type PlanKey } from '@/lib/stripe';

// POST /api/billing/checkout
// Body: { workspaceId, plan }
// Returns: { url } — redirect to Stripe Checkout
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, plan } = await request.json() as { workspaceId?: string; plan?: string };
    if (!workspaceId || !plan) {
      return NextResponse.json({ error: 'workspaceId and plan required' }, { status: 400 });
    }
    if (!['pro', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'billing_management');

    const planConfig = STRIPE_PLANS[plan as PlanKey];
    if (!planConfig.priceId) {
      return NextResponse.json({ error: 'STRIPE_PRO_PRICE_ID or STRIPE_ENTERPRISE_PRICE_ID not configured' }, { status: 503 });
    }

    const db = createAdminClient() as any;
    const { data: ws } = await db
      .from('workspaces')
      .select('stripe_customer_id')
      .eq('id', workspaceId)
      .single();

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.aiagentixdev.com';
    const session = await createCheckoutSession({
      customerId: ws?.stripe_customer_id ?? undefined,
      priceId:    planConfig.priceId,
      workspaceId,
      successUrl: `${origin}/settings?tab=billing&success=1`,
      cancelUrl:  `${origin}/settings?tab=billing`,
    });

    if (!session) return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 503 });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

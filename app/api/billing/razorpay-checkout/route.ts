import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { createSubscription, RAZORPAY_PLANS, type RazorpayPlanKey } from '@/lib/razorpay-billing';

// POST /api/billing/razorpay-checkout
// Body: { workspaceId, plan }
// Returns: { subscriptionId, checkoutUrl } — redirect to Razorpay hosted page
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, plan } = await request.json() as { workspaceId?: string; plan?: string };
    if (!workspaceId || !plan) {
      return NextResponse.json({ error: 'workspaceId and plan required' }, { status: 400 });
    }
    if (!['pro', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const planConfig = RAZORPAY_PLANS[plan as RazorpayPlanKey];
    if (!planConfig.planId) {
      return NextResponse.json({
        error: `RAZORPAY_${plan.toUpperCase()}_PLAN_ID not set in environment variables`,
      }, { status: 503 });
    }

    const subscription = await createSubscription(planConfig.planId, workspaceId);
    if (!subscription) {
      return NextResponse.json({ error: 'Failed to create subscription' }, { status: 503 });
    }

    // Save pending subscription ID
    const db = createAdminClient() as any;
    await db.from('workspaces')
      .update({ stripe_subscription_id: subscription.id }) // reusing same column
      .eq('id', workspaceId);

    return NextResponse.json({
      subscriptionId: subscription.id,
      checkoutUrl:    subscription.short_url,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

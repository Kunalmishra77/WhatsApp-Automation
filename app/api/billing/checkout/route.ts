import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { computeAmounts, planKeyFor, addOneMonth } from '@/lib/billing';
import { createOrder, createSubscription, getKeyId } from '@/lib/razorpay';

export const runtime = 'nodejs';

interface BillingPlanRow {
  key: string;
  name: string;
  base_paise: number;
  total_paise: number;
  razorpay_plan_id: string | null;
  includes_instagram: boolean;
}

// POST /api/billing/checkout
// Body: { workspaceId, has_instagram: boolean, mode: 'manual' | 'auto' }
// Manual: creates a Razorpay order + a 'created' payments row, returns Checkout.js params.
// Auto:   creates a Razorpay subscription + a 'pending' subscriptions row, returns subscription id.
// Amounts always come from the DB plan row — never from the request body.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, has_instagram, mode } = await request.json() as {
      workspaceId?: string;
      has_instagram?: boolean;
      mode?: 'manual' | 'auto';
    };

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }
    if (typeof has_instagram !== 'boolean') {
      return NextResponse.json({ error: 'has_instagram (boolean) required' }, { status: 400 });
    }
    if (mode !== 'manual' && mode !== 'auto') {
      return NextResponse.json({ error: "mode must be 'manual' or 'auto'" }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'billing_management');

    const db = createAdminClient() as any;

    const planKey = planKeyFor(has_instagram);
    const { data: plan, error: planError } = await db
      .from('billing_plans')
      .select('key, name, base_paise, total_paise, razorpay_plan_id, includes_instagram')
      .eq('key', planKey)
      .eq('active', true)
      .single();

    if (planError || !plan) {
      console.error('[Billing Checkout] plan not found', planKey, planError);
      return NextResponse.json({ error: 'Billing plan not found' }, { status: 500 });
    }
    const billingPlan = plan as BillingPlanRow;

    if (mode === 'manual') {
      const receipt = `ws_${workspaceId.slice(0, 8)}_${Date.now()}`;

      let order: { id: string };
      try {
        order = await createOrder({
          amountPaise: billingPlan.total_paise,
          receipt,
          notes: { workspace_id: workspaceId, plan_key: billingPlan.key },
        });
      } catch (err) {
        console.error('[Billing Checkout] createOrder failed', err);
        return NextResponse.json({ error: 'Payment gateway error' }, { status: 502 });
      }

      const { basePaise, gstPaise, totalPaise } = computeAmounts(billingPlan.base_paise);
      const today = new Date().toISOString().slice(0, 10);

      const { error: insertError } = await db.from('payments').insert({
        workspace_id: workspaceId,
        razorpay_order_id: order.id,
        status: 'created',
        base_paise: basePaise,
        gst_paise: gstPaise,
        total_paise: totalPaise,
        gst_rate: 18,
        currency: 'INR',
        period_start: today,
        period_end: addOneMonth(today),
      });

      if (insertError) {
        console.error('[Billing Checkout] payments insert failed', insertError);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }

      return NextResponse.json({
        mode: 'manual',
        order_id: order.id,
        amount: billingPlan.total_paise,
        currency: 'INR',
        key_id: getKeyId(),
        name: billingPlan.name,
      });
    }

    // mode === 'auto'
    if (!billingPlan.razorpay_plan_id) {
      return NextResponse.json({ error: 'auto-pay not configured' }, { status: 503 });
    }

    let subscription: { id: string };
    try {
      subscription = await createSubscription({
        planId: billingPlan.razorpay_plan_id,
        totalCount: 120,
        notes: { workspace_id: workspaceId, plan_key: billingPlan.key },
      });
    } catch (err) {
      console.error('[Billing Checkout] createSubscription failed', err);
      return NextResponse.json({ error: 'Payment gateway error' }, { status: 502 });
    }

    const { error: upsertError } = await db.from('subscriptions').upsert(
      {
        workspace_id: workspaceId,
        plan_key: billingPlan.key,
        mode: 'auto',
        has_instagram,
        status: 'pending',
        razorpay_subscription_id: subscription.id,
      },
      { onConflict: 'workspace_id' },
    );

    if (upsertError) {
      console.error('[Billing Checkout] subscriptions upsert failed', upsertError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({
      mode: 'auto',
      subscription_id: subscription.id,
      key_id: getKeyId(),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Billing Checkout]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

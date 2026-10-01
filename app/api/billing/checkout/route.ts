import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { addMonths, TERMS, PLAN_KEYS, ADDON_KEYS, type Term } from '@/lib/billing';
import { createOrder, createSubscription, getKeyId } from '@/lib/razorpay';

export const runtime = 'nodejs';

interface BillingPlanRow {
  key: string;
  term: Term;
  name: string;
  months: number;
  base_paise: number;
  total_paise: number;
  razorpay_plan_id: string | null;
  includes_instagram: boolean;
}

// POST /api/billing/checkout
// Body: { workspaceId, has_instagram, has_google_growth?, mode: 'manual'|'auto', term? }
// Modular: WhatsApp Core, plus optional Instagram / Google Growth add-ons. Both
// add-ons together resolve to the All-in-One bundle. Amounts are always summed from
// DB plan rows — never from the request body. The resolved plan + add-on flags are
// written onto the payment row so verify reads them directly.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId?: string;
      has_instagram?: boolean;
      has_google_growth?: boolean;
      mode?: 'manual' | 'auto';
      term?: Term;
    };
    const { workspaceId, mode } = body;
    const hasInstagram = body.has_instagram === true;
    const hasGoogle = body.has_google_growth === true;

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    if (typeof body.has_instagram !== 'boolean') {
      return NextResponse.json({ error: 'has_instagram (boolean) required' }, { status: 400 });
    }
    if (mode !== 'manual' && mode !== 'auto') {
      return NextResponse.json({ error: "mode must be 'manual' or 'auto'" }, { status: 400 });
    }

    const term: Term = body.term ?? 'monthly';
    if (!Object.prototype.hasOwnProperty.call(TERMS, term)) {
      return NextResponse.json({ error: `term must be one of: ${Object.keys(TERMS).join(', ')}` }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'billing_management');

    const db = createAdminClient() as any;

    // Resolve the base plan + any à-la-carte add-ons. Both add-ons → the All-in-One
    // bundle (one plan row, no separate add-on lines).
    const bundleAll = hasInstagram && hasGoogle;
    const basePlanKey = bundleAll ? PLAN_KEYS.ALL_IN_ONE : PLAN_KEYS.CORE;
    const addonKeys: string[] = bundleAll
      ? []
      : [
          ...(hasInstagram ? [ADDON_KEYS.INSTAGRAM] : []),
          ...(hasGoogle ? [ADDON_KEYS.GOOGLE_GROWTH] : []),
        ];

    const neededKeys = [basePlanKey, ...addonKeys];
    const { data: planRows, error: planError } = await db
      .from('billing_plans')
      .select('key, term, name, months, base_paise, total_paise, razorpay_plan_id, includes_instagram')
      .in('key', neededKeys)
      .eq('term', term)
      .eq('active', true);

    if (planError) {
      console.error('[Billing Checkout] plan fetch failed', neededKeys, term, planError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    const rows = (planRows ?? []) as BillingPlanRow[];
    const basePlan = rows.find((r) => r.key === basePlanKey);
    if (!basePlan) {
      console.error('[Billing Checkout] base plan not found', basePlanKey, term);
      return NextResponse.json({ error: 'Billing plan not found' }, { status: 404 });
    }
    const addonRows = addonKeys.map((k) => rows.find((r) => r.key === k)).filter(Boolean) as BillingPlanRow[];
    if (addonRows.length !== addonKeys.length) {
      console.error('[Billing Checkout] missing add-on plan row', addonKeys, term);
      return NextResponse.json({ error: 'Billing plan not found' }, { status: 404 });
    }

    const basePaise = basePlan.base_paise + addonRows.reduce((s, a) => s + a.base_paise, 0);
    const totalPaise = basePlan.total_paise + addonRows.reduce((s, a) => s + a.total_paise, 0);
    const gstPaise = totalPaise - basePaise;
    const planName = addonRows.length
      ? `${basePlan.name} + ${addonRows.map((a) => a.name.split(' — ')[0]).join(' + ')}`
      : basePlan.name;

    if (mode === 'manual') {
      const receipt = `ws_${workspaceId.slice(0, 8)}_${Date.now()}`;

      let order: { id: string };
      try {
        order = await createOrder({
          amountPaise: totalPaise,
          receipt,
          notes: { workspace_id: workspaceId, plan_key: basePlanKey, term, instagram: String(hasInstagram), google: String(hasGoogle) },
        });
      } catch (err) {
        console.error('[Billing Checkout] createOrder failed', err);
        return NextResponse.json({ error: 'Payment gateway error' }, { status: 502 });
      }

      const today = new Date().toISOString().slice(0, 10);
      const { error: insertError } = await db.from('payments').insert({
        workspace_id: workspaceId,
        razorpay_order_id: order.id,
        status: 'created',
        plan_key: basePlanKey,
        has_instagram: hasInstagram,
        has_google_growth: hasGoogle,
        base_paise: basePaise,
        gst_paise: gstPaise,
        total_paise: totalPaise,
        gst_rate: 18,
        currency: 'INR',
        term,
        period_start: today,
        period_end: addMonths(today, basePlan.months),
      });

      if (insertError) {
        console.error('[Billing Checkout] payments insert failed', insertError);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }

      return NextResponse.json({
        mode: 'manual',
        order_id: order.id,
        amount: totalPaise,
        currency: 'INR',
        key_id: getKeyId(),
        name: planName,
        term,
      });
    }

    // mode === 'auto' — single-plan auto-pay only (à-la-carte add-ons aren't a single
    // Razorpay plan). Requires razorpay_plan_id, which is set per plan at cutover.
    if (addonRows.length > 0) {
      return NextResponse.json({ error: 'Auto-pay supports Core or All-in-One only — please use one-time payment for add-on combinations.' }, { status: 400 });
    }
    if (!basePlan.razorpay_plan_id) {
      return NextResponse.json({ error: 'auto-pay not configured' }, { status: 503 });
    }

    let subscription: { id: string };
    try {
      subscription = await createSubscription({
        planId: basePlan.razorpay_plan_id,
        totalCount: 120,
        notes: { workspace_id: workspaceId, plan_key: basePlanKey, term },
      });
    } catch (err) {
      console.error('[Billing Checkout] createSubscription failed', err);
      return NextResponse.json({ error: 'Payment gateway error' }, { status: 502 });
    }

    const { error: upsertError } = await db.from('subscriptions').upsert(
      {
        workspace_id: workspaceId,
        plan_key: basePlanKey,
        term,
        mode: 'auto',
        has_instagram: hasInstagram,
        has_google_growth: hasGoogle,
        status: 'pending',
        razorpay_subscription_id: subscription.id,
      },
      { onConflict: 'workspace_id' },
    );

    if (upsertError) {
      console.error('[Billing Checkout] subscriptions upsert failed', upsertError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ mode: 'auto', subscription_id: subscription.id, key_id: getKeyId(), term });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Billing Checkout]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

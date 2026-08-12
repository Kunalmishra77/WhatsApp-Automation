import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { verifyPaymentSignature, formatInvoiceNo } from '@/lib/billing';
import { getRequiredSecret } from '@/lib/supabase-env';

export const runtime = 'nodejs';

interface PaymentRow {
  id: string;
  workspace_id: string;
  status: string;
  invoice_no: string | null;
  base_paise: number;
  total_paise: number;
  period_start: string | null;
  period_end: string | null;
}

// POST /api/billing/verify
// Body: { workspaceId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Verifies a manual (Checkout.js) payment server-side, then activates the subscription.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      await request.json() as {
        workspaceId?: string;
        razorpay_order_id?: string;
        razorpay_payment_id?: string;
        razorpay_signature?: string;
      };

    if (!workspaceId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'workspaceId, razorpay_order_id, razorpay_payment_id, razorpay_signature required' },
        { status: 400 },
      );
    }

    await requireWorkspacePermission(workspaceId, 'billing_management');

    const db = createAdminClient() as any;

    const { data: paymentData, error: paymentError } = await db
      .from('payments')
      .select('id, workspace_id, status, invoice_no, base_paise, total_paise, period_start, period_end')
      .eq('razorpay_order_id', razorpay_order_id)
      .single();

    if (paymentError || !paymentData) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }
    const payment = paymentData as PaymentRow;

    // Cross-tenant guard: the order must belong to the workspace the caller has
    // billing_management on. Without this, workspace A could replay workspace B's
    // order id + a forged/observed signature and activate A's subscription off B's paid order.
    if (payment.workspace_id !== workspaceId) {
      return NextResponse.json({ error: 'Order does not belong to this workspace' }, { status: 403 });
    }

    // Idempotent replay: already fully processed, just hand back the invoice number.
    if (payment.status === 'captured') {
      return NextResponse.json({ ok: true, invoice_no: payment.invoice_no });
    }

    if (payment.status !== 'created') {
      return NextResponse.json({ error: `Payment is in status '${payment.status}', cannot verify` }, { status: 400 });
    }

    const keySecret = getRequiredSecret('RAZORPAY_KEY_SECRET');
    const validSignature = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      keySecret,
    );

    if (!validSignature) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    // Resolve which plan this payment was for. payments has no plan_key column, so we
    // recover it from billing_plans via the base amount computeAmounts() was seeded
    // from at checkout time (base_paise is unique per plan).
    const { data: planData, error: planError } = await db
      .from('billing_plans')
      .select('key, includes_instagram')
      .eq('base_paise', payment.base_paise)
      .single();

    if (planError || !planData) {
      console.error('[Billing Verify] plan lookup failed for base_paise', payment.base_paise, planError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    const plan = planData as { key: string; includes_instagram: boolean };

    // Activate subscription + workspace BEFORE marking the payment 'captured'. If this
    // process crashes between the two steps, the payment is left in 'created' status
    // (not 'captured'), so a retried verify call — same order id + same valid signature —
    // will not hit the idempotent short-circuit above and will redo activation instead of
    // silently reporting ok:true on a half-applied state.
    const { error: subError } = await db.from('subscriptions').upsert(
      {
        workspace_id: workspaceId,
        plan_key: plan.key,
        mode: 'manual',
        status: 'active',
        has_instagram: plan.includes_instagram,
        current_period_start: payment.period_start,
        current_period_end: payment.period_end,
        grace_until: null,
        reminder_sent_for: null,
      },
      { onConflict: 'workspace_id' },
    );

    if (subError) {
      console.error('[Billing Verify] subscriptions upsert failed', subError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const { error: wsError } = await db
      .from('workspaces')
      .update({ is_active: true, subscription_status: 'active' })
      .eq('id', workspaceId);

    if (wsError) {
      console.error('[Billing Verify] workspaces update failed', wsError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Generate the invoice number, then mark the payment captured. Small retry loop
    // in case of a concurrent capture racing the same COUNT(*)-based sequence and
    // colliding on the invoice_no UNIQUE constraint.
    const year = new Date().getUTCFullYear();
    let invoiceNo: string | null = null;

    for (let attempt = 0; attempt < 3 && !invoiceNo; attempt++) {
      const { count } = await db
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .not('invoice_no', 'is', null);

      const nextSeq = (count ?? 0) + 1 + attempt;
      const candidate = formatInvoiceNo(nextSeq, year);

      const { error: captureError } = await db
        .from('payments')
        .update({
          status: 'captured',
          razorpay_payment_id,
          paid_at: new Date().toISOString(),
          invoice_no: candidate,
        })
        .eq('id', payment.id);

      if (!captureError) {
        invoiceNo = candidate;
        break;
      }

      // 23505 = unique_violation (invoice_no clash) — retry with a bumped sequence.
      if (captureError.code !== '23505') {
        console.error('[Billing Verify] payments capture update failed', captureError);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }

    if (!invoiceNo) {
      console.error('[Billing Verify] failed to allocate invoice_no after retries for payment', payment.id);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invoice_no: invoiceNo });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Billing Verify]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

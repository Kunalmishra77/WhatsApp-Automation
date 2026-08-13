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
  term: string | null;
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
      .select('id, workspace_id, status, invoice_no, base_paise, total_paise, period_start, period_end, term')
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
        term: payment.term ?? 'monthly',
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

    // Generate the invoice number, then mark the payment captured. The update is
    // conditioned on .eq('status', 'created') and .select()-ed so it's the atomic
    // "only the first writer wins" guard against a racing double-submit (e.g. a client
    // retry-on-timeout for the same payment): if two requests both pass the earlier
    // status==='created' read-check before either commits, only one UPDATE actually
    // matches a row — the other gets 0 rows back and must NOT treat that as an error or
    // burn another invoice-sequence number on its own attempt.
    const year = new Date().getUTCFullYear();
    let invoiceNo: string | null = null;
    let lostCaptureRace = false;

    for (let attempt = 0; attempt < 3 && !invoiceNo && !lostCaptureRace; attempt++) {
      const { count } = await db
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .not('invoice_no', 'is', null);

      const nextSeq = (count ?? 0) + 1 + attempt;
      const candidate = formatInvoiceNo(nextSeq, year);

      const { data: capturedRows, error: captureError } = await db
        .from('payments')
        .update({
          status: 'captured',
          razorpay_payment_id,
          paid_at: new Date().toISOString(),
          invoice_no: candidate,
        })
        .eq('id', payment.id)
        .eq('status', 'created')
        .select('invoice_no');

      if (!captureError) {
        if (capturedRows && capturedRows.length > 0) {
          invoiceNo = candidate;
        } else {
          // 0 rows affected: someone else's request already flipped this payment to
          // 'captured' between our read-check and this write. We lost the race — do
          // NOT retry with a bumped sequence, that would burn an unused invoice number.
          lostCaptureRace = true;
        }
        break;
      }

      // 23505 = unique_violation (invoice_no clash against a *different* payment row
      // racing the same COUNT(*)-based sequence) — retry with a bumped candidate.
      if (captureError.code !== '23505') {
        console.error('[Billing Verify] payments capture update failed', captureError);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }

    if (lostCaptureRace) {
      // Treat exactly like the idempotent "already captured" replay: fetch the winner's
      // invoice_no and hand it back rather than erroring or minting a duplicate.
      const { data: existing, error: refetchError } = await db
        .from('payments')
        .select('status, invoice_no')
        .eq('id', payment.id)
        .single();

      if (refetchError || !existing || existing.status !== 'captured' || !existing.invoice_no) {
        console.error('[Billing Verify] lost capture race but re-fetch did not find a captured row', payment.id, refetchError);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, invoice_no: existing.invoice_no });
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

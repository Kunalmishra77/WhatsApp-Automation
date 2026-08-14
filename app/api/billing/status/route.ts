import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermissionAny, authzResponse, AuthzError } from '@/lib/authz';
import { computeAmounts, planKeyFor, PLAN_KEYS, TERMS, type Term } from '@/lib/billing';

export const runtime = 'nodejs';

interface SubscriptionRow {
  plan_key: string;
  status: string;
  mode: string;
  has_instagram: boolean;
  term: Term;
  current_period_start: string | null;
  current_period_end: string | null;
}

interface BillingPlanRow {
  key: string;
  term: Term;
  name: string;
  months: number;
  base_paise: number;
  total_paise: number;
  original_total_paise: number | null;
}

interface PaymentRow {
  invoice_no: string | null;
  total_paise: number;
  status: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
}

// GET /api/billing/status?workspaceId=
// Read-only snapshot for the client billing page: current subscription (if any),
// the plan the workspace is (or would be) billed on with its GST breakdown, all
// active plans (so the UI can preview the WhatsApp+Instagram add-on price before
// checkout), and recent payment/invoice history. Workspace-scoped; no secrets.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    // 'view_analytics' lets managers see billing status read-only; 'billing_management'
    // (checkout/verify's gate) covers admins who can also act on it. Either is enough to view.
    await requireWorkspacePermissionAny(workspaceId, ['view_analytics', 'billing_management']);

    const db = createAdminClient() as any;

    const { data: subData, error: subError } = await db
      .from('subscriptions')
      .select('plan_key, status, mode, has_instagram, term, current_period_start, current_period_end')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (subError) {
      console.error('[Billing Status] subscription fetch failed', subError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    const subscription = (subData as SubscriptionRow | null) ?? null;

    // No subscription yet -> default to the base WhatsApp-only monthly plan so the
    // UI can still show an accurate "what you'd pay" preview before first checkout.
    const planKey = subscription?.plan_key ?? planKeyFor(false);
    const term: Term = subscription?.term ?? 'monthly';

    const { data: plansData, error: plansError } = await db
      .from('billing_plans')
      .select('key, term, name, months, base_paise, total_paise, original_total_paise')
      .in('key', [PLAN_KEYS.WHATSAPP, PLAN_KEYS.WHATSAPP_INSTAGRAM])
      .eq('active', true);

    if (plansError || !plansData) {
      console.error('[Billing Status] plans fetch failed', planKey, plansError);
      return NextResponse.json({ error: 'Billing plan not found' }, { status: 500 });
    }
    const planRows = plansData as BillingPlanRow[];

    // Full price matrix — both channels x all 4 terms — so the client can preview
    // any (channel, term) combination, including the Instagram add-on, without a
    // second round trip.
    const priceMatrix = planRows.map((p) => ({
      key: p.key,
      term: p.term,
      months: p.months,
      total_paise: Number(p.total_paise),
      original_total_paise: p.original_total_paise != null ? Number(p.original_total_paise) : null,
      label: TERMS[p.term]?.label ?? p.term,
    }));

    // Legacy monthly-only shape, kept for the current (not-yet term-aware) client:
    // one row per channel key, always at the monthly term.
    const monthlyPlanRows = planRows.filter((p) => p.term === 'monthly');
    const plans = monthlyPlanRows.map((p) => {
      const { basePaise, gstPaise, totalPaise } = computeAmounts(p.base_paise);
      return { key: p.key, name: p.name, base_paise: basePaise, gst_paise: gstPaise, total_paise: totalPaise };
    });

    // The plan the workspace is actually (or would be) billed on, at its real term.
    const activePlanRow = planRows.find((p) => p.key === planKey && p.term === term);
    if (!activePlanRow) {
      console.error('[Billing Status] resolved (plan_key, term) not found among active plans', planKey, term);
      return NextResponse.json({ error: 'Billing plan not found' }, { status: 500 });
    }
    const { basePaise: activeBasePaise, gstPaise: activeGstPaise, totalPaise: activeTotalPaise } =
      computeAmounts(activePlanRow.base_paise);
    const currentPlan = {
      key: activePlanRow.key,
      term: activePlanRow.term,
      name: activePlanRow.name,
      base_paise: activeBasePaise,
      gst_paise: activeGstPaise,
      total_paise: activeTotalPaise,
    };

    const { data: paymentsData, error: paymentsError } = await db
      .from('payments')
      .select('invoice_no, total_paise, status, paid_at, period_start, period_end')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(24);

    if (paymentsError) {
      console.error('[Billing Status] payments fetch failed', paymentsError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    const payments = (paymentsData as PaymentRow[] | null) ?? [];

    return NextResponse.json({
      subscription: subscription
        ? {
            plan_key: subscription.plan_key,
            status: subscription.status,
            mode: subscription.mode,
            has_instagram: subscription.has_instagram,
            term: subscription.term,
            current_period_start: subscription.current_period_start,
            current_period_end: subscription.current_period_end,
          }
        : null,
      plan: currentPlan,
      plans,
      price_matrix: priceMatrix,
      payments: payments.map((p) => ({
        invoice_no: p.invoice_no,
        total_paise: p.total_paise,
        status: p.status,
        paid_at: p.paid_at,
        period_start: p.period_start,
        period_end: p.period_end,
      })),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Billing Status]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

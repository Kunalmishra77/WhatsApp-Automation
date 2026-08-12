import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermissionAny, authzResponse, AuthzError } from '@/lib/authz';
import { computeAmounts, planKeyFor } from '@/lib/billing';

export const runtime = 'nodejs';

interface SubscriptionRow {
  plan_key: string;
  status: string;
  mode: string;
  has_instagram: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
}

interface BillingPlanRow {
  key: string;
  name: string;
  base_paise: number;
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
      .select('plan_key, status, mode, has_instagram, current_period_start, current_period_end')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (subError) {
      console.error('[Billing Status] subscription fetch failed', subError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    const subscription = (subData as SubscriptionRow | null) ?? null;

    // No subscription yet -> default to the base WhatsApp-only plan so the UI can
    // still show an accurate "what you'd pay" preview before the first checkout.
    const planKey = subscription?.plan_key ?? planKeyFor(false);

    const { data: plansData, error: plansError } = await db
      .from('billing_plans')
      .select('key, name, base_paise')
      .eq('active', true);

    if (plansError || !plansData) {
      console.error('[Billing Status] plans fetch failed', planKey, plansError);
      return NextResponse.json({ error: 'Billing plan not found' }, { status: 500 });
    }
    const planRows = plansData as BillingPlanRow[];
    const plans = planRows.map((p) => {
      const { basePaise, gstPaise, totalPaise } = computeAmounts(p.base_paise);
      return { key: p.key, name: p.name, base_paise: basePaise, gst_paise: gstPaise, total_paise: totalPaise };
    });

    const currentPlan = plans.find((p) => p.key === planKey);
    if (!currentPlan) {
      console.error('[Billing Status] resolved plan_key not found among active plans', planKey);
      return NextResponse.json({ error: 'Billing plan not found' }, { status: 500 });
    }

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
            current_period_start: subscription.current_period_start,
            current_period_end: subscription.current_period_end,
          }
        : null,
      plan: currentPlan,
      plans,
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

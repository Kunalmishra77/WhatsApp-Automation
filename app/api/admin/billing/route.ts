import { NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { AuthzError, authzResponse } from '@/lib/authz';
import { paginateAll } from '@/lib/export-stream';
import type { SubStatus } from '@/lib/billing';

export const runtime = 'nodejs';

// GET /api/admin/billing — super-admin billing overview: MRR, subscription status
// counts, Instagram add-on revenue, recent payment history, overdue/failed
// subscriptions, a best-effort webhook-vs-DB reconciliation count, and the current
// grace/reminder config. Strictly platform-admin (requirePlatformAdmin throws 401/403
// otherwise). All money is in paise; the client renders via rupees(). Sums that back a
// financial total (MRR, lifetime captured revenue) are computed via paginateAll so they
// are never silently truncated by PostgREST's 1000-row default — only the *display*
// lists (payment history, overdue, failed) are intentionally bounded to a recent window.

const SUB_STATUSES: SubStatus[] = ['pending', 'active', 'past_due', 'suspended', 'cancelled'];
const PAYMENT_HISTORY_LIMIT = 100;
const OVERDUE_LIMIT = 200;
const FAILED_PAYMENTS_LIMIT = 50;
const RECONCILE_EVENT_WINDOW = 3000; // recent webhook events scanned for the reconciliation check

interface ActiveSubRow {
  id: string;
  plan_key: string;
  has_instagram: boolean;
  is_comped: boolean;
}
interface PlanRow {
  key: string;
  name: string;
  total_paise: number;
}
interface WorkspaceNameRel {
  name: string | null;
}
interface PaymentHistoryRow {
  id: string;
  invoice_no: string | null;
  total_paise: number;
  status: string;
  method: string | null;
  created_at: string;
  paid_at: string | null;
  workspace_id: string;
  workspaces: WorkspaceNameRel | WorkspaceNameRel[] | null;
}
interface OverdueSubRow {
  id: string;
  workspace_id: string;
  plan_key: string;
  status: string;
  grace_until: string | null;
  current_period_end: string | null;
  workspaces: WorkspaceNameRel | WorkspaceNameRel[] | null;
}
interface FailedPaymentRow {
  id: string;
  invoice_no: string | null;
  total_paise: number;
  workspace_id: string;
  created_at: string;
  workspaces: WorkspaceNameRel | WorkspaceNameRel[] | null;
}
interface WebhookEventRow {
  event_type: string | null;
  payload: { subscription?: { entity?: { id?: string } } } | null;
  processed_at: string;
}
interface SubRzpRow {
  id: string;
  status: string;
  razorpay_subscription_id: string | null;
}

function wsName(w: WorkspaceNameRel | WorkspaceNameRel[] | null): string {
  if (!w) return 'Unknown';
  const row = Array.isArray(w) ? w[0] : w;
  return row?.name ?? 'Unknown';
}

// Which subscriptions.status a given webhook event *should* have resulted in — used
// only for the best-effort reconciliation count below, not for any writes.
const EVENT_EXPECTED_STATUS: Record<string, SubStatus> = {
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.pending': 'past_due',
  'subscription.halted': 'suspended',
  'subscription.cancelled': 'cancelled',
};

export async function GET() {
  try {
    await requirePlatformAdmin();
    const db = createAdminClient() as any;

    // ── Plans (tiny fixed table — safe to fetch whole) ──
    const { data: plansData, error: plansErr } = await db
      .from('billing_plans')
      .select('key, name, total_paise');
    if (plansErr) throw plansErr;
    const plans = (plansData ?? []) as PlanRow[];
    const planByKey = new Map(plans.map((p) => [p.key, p]));
    const whatsappPlan = planByKey.get('whatsapp');
    const bundlePlan = planByKey.get('whatsapp_instagram');
    const igAddOnPaise = whatsappPlan && bundlePlan ? bundlePlan.total_paise - whatsappPlan.total_paise : 0;

    // ── Status counts — exact head-only counts, never subject to the 1000-row cap ──
    const statusCounts: Record<string, number> = {};
    await Promise.all(SUB_STATUSES.map(async (status) => {
      const { count } = await db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', status);
      statusCounts[status] = count ?? 0;
    }));

    // ── MRR + Instagram add-on revenue: page through ALL active subs, never capped ──
    let mrrPaise = 0;
    let igActiveCount = 0;
    let compedActiveCount = 0;
    for await (const page of paginateAll<ActiveSubRow>((offset, pageSize) =>
      db.from('subscriptions')
        .select('id, plan_key, has_instagram, is_comped')
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const row of page) {
        const plan = planByKey.get(row.plan_key);
        if (plan) {
          mrrPaise += plan.total_paise; // INR only for now — grouped explicitly below, not summed cross-currency
        } else {
          // A subscription referencing a plan_key that no longer exists in billing_plans
          // (renamed/deleted) would silently undercount MRR with no signal — log it.
          console.error(`[AdminBilling] MRR: no plan row for plan_key "${row.plan_key}" (subscription ${row.id}) — skipped`);
        }
        if (row.has_instagram) igActiveCount++;
        if (row.is_comped) compedActiveCount++;
      }
    }
    const igAddOnRevenuePaise = igActiveCount * igAddOnPaise;

    // ── Lifetime captured revenue: paginated aggregate — a financial total, never capped.
    // Grouped by currency like MRR (INR only today) — filtered here rather than summed
    // across currencies; multi-currency grouping is a future extension.
    let totalCapturedPaiseInr = 0;
    for await (const page of paginateAll<{ total_paise: number }>((offset, pageSize) =>
      db.from('payments')
        .select('total_paise')
        .eq('status', 'captured')
        .eq('currency', 'INR')
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const row of page) totalCapturedPaiseInr += row.total_paise ?? 0;
    }

    // ── Payment history — recent window, bounded by design (not a financial total) ──
    const { data: paymentsData, error: paymentsErr } = await db
      .from('payments')
      .select('id, invoice_no, total_paise, status, method, created_at, paid_at, workspace_id, workspaces(name)')
      .order('created_at', { ascending: false })
      .limit(PAYMENT_HISTORY_LIMIT);
    if (paymentsErr) throw paymentsErr;
    const paymentHistory = ((paymentsData ?? []) as PaymentHistoryRow[]).map((p) => ({
      id: p.id,
      invoice_no: p.invoice_no,
      total_paise: p.total_paise,
      status: p.status,
      method: p.method,
      created_at: p.created_at,
      paid_at: p.paid_at,
      workspace_id: p.workspace_id,
      workspace_name: wsName(p.workspaces),
    }));

    // ── Overdue (past_due) subscriptions, soonest grace deadline first ──
    const { data: overdueData, error: overdueErr } = await db
      .from('subscriptions')
      .select('id, workspace_id, plan_key, status, grace_until, current_period_end, workspaces(name)')
      .eq('status', 'past_due')
      .order('grace_until', { ascending: true })
      .limit(OVERDUE_LIMIT);
    if (overdueErr) throw overdueErr;
    const overdue = ((overdueData ?? []) as OverdueSubRow[]).map((s) => ({
      subscription_id: s.id,
      workspace_id: s.workspace_id,
      workspace_name: wsName(s.workspaces),
      plan_key: s.plan_key,
      grace_until: s.grace_until,
      current_period_end: s.current_period_end,
    }));

    // ── Recent failed payments ──
    const { data: failedData, error: failedErr } = await db
      .from('payments')
      .select('id, invoice_no, total_paise, workspace_id, created_at, workspaces(name)')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(FAILED_PAYMENTS_LIMIT);
    if (failedErr) throw failedErr;
    const failedPayments = ((failedData ?? []) as FailedPaymentRow[]).map((p) => ({
      id: p.id,
      invoice_no: p.invoice_no,
      total_paise: p.total_paise,
      workspace_id: p.workspace_id,
      workspace_name: wsName(p.workspaces),
      created_at: p.created_at,
    }));

    // ── Reconciliation (best-effort, informational only): flag subscriptions whose
    // current status disagrees with the latest subscription.* webhook event recorded
    // for their razorpay_subscription_id. Only scans a bounded recent window of events
    // — a drift older than that window won't be caught, which is fine for a health
    // signal (this is not a financial total, so it isn't paginated to completion).
    let reconciliationMismatches = 0;
    try {
      const { data: eventsData } = await db
        .from('billing_webhook_events')
        .select('event_type, payload, processed_at')
        .like('event_type', 'subscription.%')
        .order('processed_at', { ascending: false })
        .limit(RECONCILE_EVENT_WINDOW);

      const latestByRzpSub = new Map<string, SubStatus>();
      for (const ev of (eventsData ?? []) as WebhookEventRow[]) {
        const rzpId = ev.payload?.subscription?.entity?.id;
        const expected = ev.event_type ? EVENT_EXPECTED_STATUS[ev.event_type] : undefined;
        if (!rzpId || !expected || latestByRzpSub.has(rzpId)) continue; // events are ordered desc — first hit is the latest
        latestByRzpSub.set(rzpId, expected);
      }

      const { data: subsData } = await db
        .from('subscriptions')
        .select('id, status, razorpay_subscription_id')
        .not('razorpay_subscription_id', 'is', null);
      for (const s of (subsData ?? []) as SubRzpRow[]) {
        const expected = s.razorpay_subscription_id ? latestByRzpSub.get(s.razorpay_subscription_id) : undefined;
        if (expected && expected !== s.status) reconciliationMismatches++;
      }
    } catch (err) {
      console.error('[AdminBilling] reconciliation check failed (non-fatal)', err);
    }

    // ── Grace/reminder config ──
    const { data: configData } = await db
      .from('billing_config')
      .select('grace_days, reminder_days_before')
      .eq('id', 1)
      .maybeSingle();

    return NextResponse.json({
      mrr: { INR: mrrPaise }, // grouped by currency — INR only for now, never summed cross-currency
      status_counts: statusCounts,
      instagram_addon: {
        active_count: igActiveCount,
        addon_paise: igAddOnPaise,
        revenue_paise: igAddOnRevenuePaise,
      },
      comped_active_count: compedActiveCount,
      total_captured: { INR: totalCapturedPaiseInr }, // grouped by currency, like MRR
      payment_history: paymentHistory,
      overdue,
      failed_payments: failedPayments,
      reconciliation_mismatches: reconciliationMismatches,
      config: configData ?? { grace_days: 3, reminder_days_before: 3 },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminBilling GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { getRequiredSecret } from '@/lib/supabase-env';
import { nextBillingAction, rupees, type SubStatus } from '@/lib/billing';
import { sendMail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface SubscriptionRow {
  id: string;
  workspace_id: string;
  plan_key: string;
  status: SubStatus;
  current_period_end: string | null;
  grace_until: string | null;
  reminder_sent_for: string | null;
}
interface PlanRow {
  key: string;
  name: string;
  total_paise: number;
}
interface WorkspaceRow {
  id: string;
  name: string | null;
  owner_email: string | null;
}
interface AdminMemberRow {
  user_id: string;
  profiles: { email: string | null } | { email: string | null }[] | null;
}

// 'YYYY-MM-DD' in IST — matches the convention used elsewhere for date-range boundaries.
function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function adminEmails(rows: AdminMemberRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const p = r.profiles;
    const email = Array.isArray(p) ? p[0]?.email : p?.email;
    if (email) out.push(email);
  }
  return out;
}

// POST /api/cron/billing-sweep — external cron (Bearer CRON_SECRET). Schedule lives in
// migration 065 (pg_cron job 'billing-sweep'); this route is not self-scheduling.
export async function POST(request: NextRequest) {
  let cronSecret: string;
  try {
    cronSecret = getRequiredSecret('CRON_SECRET');
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;

  const { data: configRow } = await db
    .from('billing_config')
    .select('grace_days, reminder_days_before')
    .eq('id', 1)
    .maybeSingle();
  const graceDays = (configRow as { grace_days: number; reminder_days_before: number } | null)?.grace_days ?? 3;
  const reminderDaysBefore = (configRow as { grace_days: number; reminder_days_before: number } | null)?.reminder_days_before ?? 3;

  const { data: subs, error: subsError } = await db
    .from('subscriptions')
    .select('id, workspace_id, plan_key, status, current_period_end, grace_until, reminder_sent_for')
    .eq('is_comped', false);

  if (subsError) {
    console.error('[billing-sweep] failed to load subscriptions:', subsError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const today = todayIST();

  let processed = 0;
  let reminded = 0;
  let graced = 0;
  let suspended = 0;
  let failed = 0;

  for (const sub of ((subs ?? []) as SubscriptionRow[])) {
    // No period-end means there's nothing to compute a renewal/grace boundary against.
    if (!sub.current_period_end) continue;
    processed++;

    try {
      const result = nextBillingAction({
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        graceUntil: sub.grace_until,
        today,
        graceDays,
        reminderDaysBefore,
        reminderSentFor: sub.reminder_sent_for,
      });

      if (result.action === 'none') continue;

      const { data: wsData } = await db
        .from('workspaces')
        .select('id, name, owner_email')
        .eq('id', sub.workspace_id)
        .maybeSingle();
      const workspace = wsData as WorkspaceRow | null;
      if (!workspace) throw new Error(`workspace ${sub.workspace_id} not found`);

      const { data: planData } = await db
        .from('billing_plans')
        .select('key, name, total_paise')
        .eq('key', sub.plan_key)
        .maybeSingle();
      const plan = planData as PlanRow | null;
      if (!plan) throw new Error(`billing_plans row not found for key ${sub.plan_key}`);

      const { data: memberRows } = await db
        .from('workspace_members')
        .select('user_id, profiles(email)')
        .eq('workspace_id', sub.workspace_id)
        .in('role', ['super_admin', 'admin']);
      const admins = (memberRows ?? []) as AdminMemberRow[];

      const to = workspace.owner_email ? [workspace.owner_email] : adminEmails(admins);
      const wsName = workspace.name ?? 'your workspace';

      if (result.action === 'send_reminder') {
        const { error: updErr } = await db
          .from('subscriptions')
          .update({ reminder_sent_for: result.reminderSentFor })
          .eq('id', sub.id);
        if (updErr) throw updErr;

        if (admins.length > 0) {
          await db.from('notifications').insert(
            admins.map((a) => ({
              workspace_id: sub.workspace_id,
              user_id: a.user_id,
              type: 'billing_reminder',
              title: `Recharge reminder — ${plan.name}`,
              body: `Your plan renews on ${sub.current_period_end}. Amount due: ₹${rupees(plan.total_paise)}.`,
              data: { plan_key: plan.key, amount_paise: plan.total_paise, current_period_end: sub.current_period_end },
            })),
          );
        }

        if (to.length > 0) {
          const r = await sendMail({
            to,
            subject: `Recharge reminder — ${wsName}`,
            html: `<p>Your Agentix subscription (${plan.name}) renews on <strong>${sub.current_period_end}</strong>.</p>`
              + `<p>Amount due: <strong>₹${rupees(plan.total_paise)}</strong>.</p>`,
          });
          if (!r.ok) console.error('[billing-sweep] reminder email failed:', sub.workspace_id, r.error);
        }
        reminded++;
      } else if (result.action === 'enter_grace') {
        const { error: updErr } = await db
          .from('subscriptions')
          .update({ status: 'past_due', grace_until: result.graceUntil })
          .eq('id', sub.id);
        if (updErr) throw updErr;

        if (admins.length > 0) {
          await db.from('notifications').insert(
            admins.map((a) => ({
              workspace_id: sub.workspace_id,
              user_id: a.user_id,
              type: 'billing_grace',
              title: 'Payment overdue',
              body: `Payment overdue — pay within ${graceDays} day(s) to avoid suspension.`,
              data: { plan_key: plan.key, grace_until: result.graceUntil },
            })),
          );
        }

        if (to.length > 0) {
          const r = await sendMail({
            to,
            subject: `Payment overdue — ${wsName}`,
            html: `<p>Your payment for <strong>${plan.name}</strong> is overdue.</p>`
              + `<p>Pay within <strong>${graceDays} day(s)</strong> (by ${result.graceUntil}) to avoid suspension.</p>`,
          });
          if (!r.ok) console.error('[billing-sweep] grace email failed:', sub.workspace_id, r.error);
        }
        graced++;
      } else if (result.action === 'suspend') {
        const { error: subUpdErr } = await db
          .from('subscriptions')
          .update({ status: 'suspended' })
          .eq('id', sub.id);
        if (subUpdErr) throw subUpdErr;

        const { error: wsUpdErr } = await db
          .from('workspaces')
          .update({ is_active: false, subscription_status: 'suspended' })
          .eq('id', sub.workspace_id);
        if (wsUpdErr) throw wsUpdErr;

        if (admins.length > 0) {
          await db.from('notifications').insert(
            admins.map((a) => ({
              workspace_id: sub.workspace_id,
              user_id: a.user_id,
              type: 'billing_suspended',
              title: 'Subscription ended',
              body: 'Subscription ended — pay to restart.',
              data: { plan_key: plan.key },
            })),
          );
        }

        if (to.length > 0) {
          const r = await sendMail({
            to,
            subject: `Subscription ended — ${wsName}`,
            html: `<p>Your Agentix subscription (${plan.name}) has ended due to non-payment.</p>`
              + `<p>Pay to restart service.</p>`,
          });
          if (!r.ok) console.error('[billing-sweep] suspend email failed:', sub.workspace_id, r.error);
        }
        suspended++;
      }
    } catch (err) {
      failed++;
      console.error('[billing-sweep] failed for subscription', sub.id, sub.workspace_id, err);
    }
  }

  return NextResponse.json({ processed, reminded, graced, suspended, failed });
}

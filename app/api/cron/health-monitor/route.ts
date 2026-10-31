import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';

export const maxDuration = 60;

interface CheckResult {
  status: 'ok' | 'warning' | 'error';
  message: string;
  value?: number | string;
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  // Allow external cron calls via CRON_SECRET bearer token
  const secret = process.env.CRON_SECRET;
  const auth   = request.headers.get('authorization');
  if (secret && auth === `Bearer ${secret}`) return true;

  // Allow logged-in platform admins (admin UI "Run Check" button)
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const db = createAdminClient() as any;
    const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
    return !!profile?.is_platform_admin;
  } catch {
    return false;
  }
}

// POST /api/cron/health-monitor — external cron (Bearer CRON_SECRET)
// GET  /api/cron/health-monitor — admin UI "Run Check" button (session auth)
export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;
  const checks: Record<string, CheckResult> = {};
  const errors: string[] = [];

  // ── Check 1: DB connectivity ──────────────────────────────────────────────
  try {
    const { count } = await db
      .from('workspaces')
      .select('id', { count: 'exact', head: true });
    checks.db_connectivity = { status: 'ok', message: 'Database reachable', value: count ?? 0 };
  } catch (e) {
    checks.db_connectivity = { status: 'error', message: `DB unreachable: ${e instanceof Error ? e.message : 'unknown'}` };
    errors.push('Database connectivity failed');
  }

  // ── Check 2: Active workspaces ────────────────────────────────────────────
  try {
    const { count: total } = await db.from('workspaces').select('id', { count: 'exact', head: true });
    const { count: active } = await db.from('workspaces').select('id', { count: 'exact', head: true }).eq('is_active', true);
    checks.workspaces = { status: 'ok', message: `${active}/${total} workspaces active`, value: active ?? 0 };
  } catch {
    checks.workspaces = { status: 'warning', message: 'Could not fetch workspace count' };
  }

  // ── Check 3: Messages in last hour ────────────────────────────────────────
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: msgCount } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo);
    checks.messages_last_hour = { status: 'ok', message: `${msgCount ?? 0} messages in last hour`, value: msgCount ?? 0 };
  } catch {
    checks.messages_last_hour = { status: 'warning', message: 'Could not fetch message count' };
  }

  // ── Check 4: Open support tickets ─────────────────────────────────────────
  try {
    const { count: openTickets } = await db
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');
    const ticketStatus = (openTickets ?? 0) > 10 ? 'warning' : 'ok';
    checks.open_support_tickets = {
      status: ticketStatus,
      message: `${openTickets ?? 0} open support tickets`,
      value: openTickets ?? 0,
    };
    if (ticketStatus === 'warning') errors.push(`High number of open tickets: ${openTickets}`);
  } catch {
    checks.open_support_tickets = { status: 'warning', message: 'Could not fetch ticket count' };
  }

  // ── Check 5: Failed campaign recipients (last 24h) ────────────────────────
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: failed } = await db
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('updated_at', dayAgo);
    const failedStatus = (failed ?? 0) > 50 ? 'warning' : 'ok';
    checks.campaign_failures_24h = {
      status: failedStatus,
      message: `${failed ?? 0} failed campaign deliveries in 24h`,
      value: failed ?? 0,
    };
    if (failedStatus === 'warning') errors.push(`High campaign failure rate: ${failed} in 24h`);
  } catch {
    checks.campaign_failures_24h = { status: 'warning', message: 'Could not fetch campaign failures' };
  }

  // ── Check 6: Blocked workspaces ───────────────────────────────────────────
  try {
    const { count: halted } = await db
      .from('workspaces')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_status', 'halted');
    checks.halted_workspaces = {
      status: (halted ?? 0) > 0 ? 'warning' : 'ok',
      message: `${halted ?? 0} halted workspaces`,
      value: halted ?? 0,
    };
  } catch {
    checks.halted_workspaces = { status: 'warning', message: 'Could not fetch halted workspaces' };
  }

  // ── Check 7: Duplicate campaign sends (last 24h) ──────────────────────────
  //
  // 30,686 campaign messages went out twice before anyone noticed, and the only
  // reason they were ever noticed is that someone went looking for something
  // else. The races are closed; this is so a hole in that fix shows up the same
  // day instead of the same quarter.
  //
  // Any duplicate at all is an error, not a warning. There is no acceptable
  // number: on WhatsApp the same marketing message twice is what drops a
  // number's quality rating, and Meta throttles or bans on that — so one is a
  // signal and fifty is an emergency, but neither is normal.
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db.rpc('campaign_duplicate_sends', { p_since: dayAgo });
    if (error) throw new Error(error.message);

    const row = (data?.[0] ?? { pairs: 0, extra_sends: 0, campaigns: 0 }) as {
      pairs: number; extra_sends: number; campaigns: number;
    };
    const extra = Number(row.extra_sends ?? 0);

    checks.duplicate_campaign_sends_24h = {
      status: extra > 0 ? 'error' : 'ok',
      message: extra > 0
        ? `${extra} duplicate send(s) to ${row.pairs} number(s) across ${row.campaigns} campaign(s) in 24h`
        : 'No duplicate campaign sends in 24h',
      value: extra,
    };
    if (extra > 0) {
      errors.push(`Duplicate campaign sends: ${extra} extra message(s) to ${row.pairs} number(s) in 24h`);
    }
  } catch (e) {
    // A check that cannot run is reported, not assumed clean. "No duplicates"
    // and "could not look" were indistinguishable for months.
    checks.duplicate_campaign_sends_24h = {
      status: 'warning',
      message: `Could not check for duplicate sends: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }

  // ── Determine overall status ──────────────────────────────────────────────
  const hasError   = Object.values(checks).some(c => c.status === 'error');
  const hasWarning = Object.values(checks).some(c => c.status === 'warning');
  const overall = hasError ? 'critical' : hasWarning ? 'warning' : 'healthy';
  const hasErrors = errors.length > 0;

  // ── Save report to DB ─────────────────────────────────────────────────────
  await db.from('platform_health_reports').insert({
    overall_status: overall,
    checks,
    errors,
    has_errors: hasErrors,
  });

  // ── Tell someone ──────────────────────────────────────────────────────────
  //
  // This wrote a row and stopped. An error report was "kept until manually
  // resolved" in a table nobody opens — which is the same failure mode as the
  // duplicate sends it now watches for: the platform knew, and nobody was told.
  //
  // Only on `critical`, and only when the previous report was not also
  // critical. A daily email that always arrives is a daily email nobody reads,
  // and the point of this one is that its arrival means something.
  if (overall === 'critical') {
    try {
      const { data: prior } = await db
        .from('platform_health_reports')
        .select('overall_status')
        .order('created_at', { ascending: false })
        .range(1, 1);   // skip the row just inserted

      const wasAlreadyCritical = (prior as Array<{ overall_status: string }> | null)?.[0]?.overall_status === 'critical';

      if (!wasAlreadyCritical) {
        const { data: admins } = await db
          .from('profiles').select('email').eq('is_platform_admin', true);
        const to = ((admins ?? []) as Array<{ email: string | null }>)
          .map((a) => a.email).filter(Boolean) as string[];

        if (to.length > 0) {
          const { sendMail } = await import('@/lib/mailer');
          await sendMail({
            to,
            subject: `⚠️ AGENTiX — platform health is critical`,
            html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2b4a">
              <h2 style="margin:0 0 12px;color:#b91c1c">Something needs looking at</h2>
              <ul style="color:#444;line-height:1.7">
                ${errors.map((e) => `<li>${e}</li>`).join('')}
              </ul>
              <p style="color:#666;font-size:13px;line-height:1.6">From the daily platform health check. The full report is in Admin → Health.</p>
            </div>`,
          }).catch(() => {});
        }
      }
    } catch (e) {
      // Never fails the check: the report is already saved, and a mail server
      // being down must not cost the record of what was wrong.
      console.error('[HealthMonitor] could not send the alert:', e);
    }
  }

  // ── Auto-cleanup: delete healthy reports older than 24h ───────────────────
  // Error reports are kept until manually resolved
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await db
    .from('platform_health_reports')
    .delete()
    .eq('has_errors', false)
    .lt('created_at', oneDayAgo);

  return NextResponse.json({
    success: true,
    overall,
    checks,
    errors,
    saved: true,
  });
}

// GET — manual trigger from admin UI
export async function GET(request: NextRequest) {
  return POST(request);
}

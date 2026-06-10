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

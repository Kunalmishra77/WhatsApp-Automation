import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { PLAN_KEYS } from '@/lib/billing';

export const runtime = 'nodejs';

const TRIAL_DAYS = 3;

// POST /api/onboarding/start-trial  { workspaceId }
// Starts a 3-day free trial (no payment): activates the workspace in 'trialing'
// state on the Core plan. Add-ons stay locked and Core is capped (enforced via
// lib/entitlements). Idempotent, and refuses if the workspace already has a
// subscription (paid, comped, or a trial already used) so it can't be replayed
// to extend the trial.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown };
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'billing_management');

    const db = createAdminClient() as any;

    // Already active (paid/comped/trialing) → idempotent success, don't reset the clock.
    const { data: ws } = await db
      .from('workspaces')
      .select('is_active, trial_ends_at')
      .eq('id', workspaceId)
      .maybeSingle();
    const { data: existingSub } = await db
      .from('subscriptions')
      .select('status')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (ws?.is_active === true || existingSub) {
      return NextResponse.json({ ok: true, already_active: true });
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    const endIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(trialEnd);

    const { error: subError } = await db.from('subscriptions').upsert(
      {
        workspace_id: workspaceId,
        plan_key: PLAN_KEYS.CORE,
        term: 'monthly',
        mode: 'manual',
        status: 'trialing',
        has_instagram: false,
        has_google_growth: false,
        is_comped: false,
        current_period_start: todayIST,
        current_period_end: endIST,
        grace_until: null,
        reminder_sent_for: null,
        grace_reminder_sent_for: null,
      },
      { onConflict: 'workspace_id' },
    );
    if (subError) {
      console.error('[start-trial] subscriptions upsert failed', workspaceId, subError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const { error: wsError } = await db
      .from('workspaces')
      .update({ is_active: true, subscription_status: 'trialing', trial_ends_at: trialEnd.toISOString() })
      .eq('id', workspaceId);
    if (wsError) {
      console.error('[start-trial] workspaces update failed', workspaceId, wsError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, trial_ends_at: trialEnd.toISOString() });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[start-trial]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

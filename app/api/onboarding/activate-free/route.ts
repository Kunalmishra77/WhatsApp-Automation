import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { planKeyFor } from '@/lib/billing';

export const runtime = 'nodejs';

// POST /api/onboarding/activate-free  { workspaceId }
// Free-activates a workspace WITHOUT payment — but ONLY while the global payments
// kill-switch (billing_config.payments_enabled) is off. This is the self-serve
// onboarding path used when we can't collect payment yet (e.g. the Razorpay
// website is still under review). When payments are enabled, this refuses and the
// caller must go through checkout instead, so it can never be used to skip a bill.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown };
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    // Same gate as checkout — only someone who could pay for this workspace can
    // free-activate it (and only members of that workspace at all).
    await requireWorkspacePermission(workspaceId, 'billing_management');

    const db = createAdminClient() as any;

    const { data: cfg } = await db
      .from('billing_config')
      .select('payments_enabled')
      .eq('id', 1)
      .maybeSingle();
    const paymentsEnabled = (cfg as { payments_enabled: boolean } | null)?.payments_enabled ?? true;

    // Hard stop: never hand out free activation while we're actually collecting money.
    if (paymentsEnabled) {
      return NextResponse.json(
        { error: 'Payments are enabled — please complete checkout to activate.' },
        { status: 409 },
      );
    }

    // Already active — nothing to do (idempotent for a double-click / refresh).
    const { data: ws } = await db
      .from('workspaces')
      .select('is_active')
      .eq('id', workspaceId)
      .maybeSingle();
    if (ws?.is_active === true) {
      return NextResponse.json({ ok: true, already_active: true });
    }

    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    const periodEndIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(periodEnd);

    // Comped WhatsApp-only subscription so the daily billing sweep skips it and the
    // dashboard gate sees an active plan. Mirrors the shape verify() writes on a paid
    // activation, minus the payment.
    const { error: subError } = await db.from('subscriptions').upsert(
      {
        workspace_id: workspaceId,
        plan_key: planKeyFor(false),
        term: 'monthly',
        mode: 'manual',
        status: 'active',
        has_instagram: false,
        is_comped: true,
        current_period_start: todayIST,
        current_period_end: periodEndIST,
        grace_until: null,
        reminder_sent_for: null,
        grace_reminder_sent_for: null,
      },
      { onConflict: 'workspace_id' },
    );
    if (subError) {
      console.error('[activate-free] subscriptions upsert failed', workspaceId, subError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const { error: wsError } = await db
      .from('workspaces')
      .update({ is_active: true, subscription_status: 'active' })
      .eq('id', workspaceId);
    if (wsError) {
      console.error('[activate-free] workspaces update failed', workspaceId, wsError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[activate-free]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

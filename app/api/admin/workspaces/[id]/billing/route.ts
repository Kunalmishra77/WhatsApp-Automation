import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { PLAN_KEYS } from '@/lib/billing';

export const runtime = 'nodejs';

// GET /api/admin/workspaces/:id/billing → current comp/enforcement state.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard) return guard;
  const { id } = await params;
  const db = createAdminClient() as any;
  const { data: sub } = await db
    .from('subscriptions')
    .select('status, plan_key, is_comped, current_period_end')
    .eq('workspace_id', id)
    .maybeSingle();
  return NextResponse.json({
    comped: sub?.is_comped === true,
    status: sub?.status ?? null,
    plan_key: sub?.plan_key ?? null,
    current_period_end: sub?.current_period_end ?? null,
    has_subscription: !!sub,
  });
}

// POST /api/admin/workspaces/:id/billing  Body: { comped: boolean }
// Admin attaches (comped=false) or removes (comped=true) billing enforcement for a
// client — works for existing OR new clients. Comped = payment gateway OFF (free,
// billing sweep skips). Un-comped = gateway ON (subject to trial/renewal/suspension).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard) return guard;

  const { id } = await params;
  const { comped } = await request.json() as { comped?: boolean };
  if (typeof comped !== 'boolean') {
    return NextResponse.json({ error: 'comped (boolean) required' }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { data: existing } = await db
    .from('subscriptions')
    .select('id, plan_key, term, current_period_end')
    .eq('workspace_id', id)
    .maybeSingle();

  if (comped) {
    // Gateway OFF — comp the client: free access, sweep skips it, keep them active.
    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const farEnd = new Date(); farEnd.setFullYear(farEnd.getFullYear() + 1);
    const endIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(farEnd);
    const { error: subErr } = await db.from('subscriptions').upsert(
      {
        workspace_id: id,
        plan_key: existing?.plan_key ?? PLAN_KEYS.ALL_IN_ONE, // comped clients get everything
        term: existing?.term ?? 'monthly',
        mode: 'manual',
        status: 'active',
        is_comped: true,
        current_period_start: todayIST,
        current_period_end: existing?.current_period_end ?? endIST,
      },
      { onConflict: 'workspace_id' },
    );
    if (subErr) { console.error('[admin comp on]', subErr); return NextResponse.json({ error: 'Failed to comp workspace' }, { status: 500 }); }
    await db.from('workspaces').update({ is_active: true, subscription_status: 'active', trial_ends_at: null }).eq('id', id);
    return NextResponse.json({ ok: true, comped: true });
  }

  // Gateway ON — enforce billing. If no subscription exists, nothing to un-comp yet
  // (they'll go through trial/checkout); if one exists, just clear the comp flag so the
  // sweep governs it from here. is_active is left as-is to avoid an abrupt lockout.
  if (!existing) {
    return NextResponse.json({ ok: true, comped: false, note: 'No subscription yet — client will pay via trial/checkout.' });
  }
  const { error: subErr } = await db.from('subscriptions').update({ is_comped: false }).eq('id', existing.id);
  if (subErr) { console.error('[admin comp off]', subErr); return NextResponse.json({ error: 'Failed to enforce billing' }, { status: 500 }); }
  return NextResponse.json({ ok: true, comped: false });
}

async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

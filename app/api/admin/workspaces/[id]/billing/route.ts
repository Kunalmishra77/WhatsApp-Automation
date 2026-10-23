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
    .select('status, plan_key, is_comped, current_period_end, has_instagram, has_google_growth')
    .eq('workspace_id', id)
    .maybeSingle();
  return NextResponse.json({
    comped: sub?.is_comped === true,
    status: sub?.status ?? null,
    plan_key: sub?.plan_key ?? null,
    current_period_end: sub?.current_period_end ?? null,
    has_instagram: sub?.has_instagram === true,
    has_google_growth: sub?.has_google_growth === true,
    has_subscription: !!sub,
  });
}

// PATCH /api/admin/workspaces/:id/billing
// Body: { plan_key?: 'core'|'all_in_one', has_instagram?: boolean, has_google_growth?: boolean }
//
// Grants or removes the paid add-ons for a client. Until this existed there was no
// way to do it at all: the admin plan dropdown writes workspaces.plan, a separate
// legacy field that gates Flows and CRM but has nothing to do with the modules in
// the sidebar. Those come from the subscription, which only the client's own
// checkout ever wrote — so a client paying for Google Growth over the phone could
// not be given it.
//
// Comped clients already receive every module and are left alone here.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard) return guard;

  const { id } = await params;
  const body = await request.json().catch(() => null) as {
    plan_key?: string; has_instagram?: boolean; has_google_growth?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 });

  if (body.plan_key !== undefined
      && body.plan_key !== PLAN_KEYS.CORE
      && body.plan_key !== PLAN_KEYS.ALL_IN_ONE) {
    return NextResponse.json({ error: 'plan_key must be "core" or "all_in_one"' }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { data: existing } = await db
    .from('subscriptions')
    .select('id, plan_key, term, current_period_end')
    .eq('workspace_id', id)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (body.plan_key !== undefined)          patch.plan_key = body.plan_key;
  if (body.has_instagram !== undefined)     patch.has_instagram = body.has_instagram;
  if (body.has_google_growth !== undefined) patch.has_google_growth = body.has_google_growth;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  // A client who has never checked out has no subscription row, and that is
  // exactly the client an admin is most likely to be granting an add-on to. Create
  // one rather than refusing, matching what the comp path already does.
  if (!existing) {
    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const farEnd = new Date(); farEnd.setFullYear(farEnd.getFullYear() + 1);
    const { error } = await db.from('subscriptions').upsert(
      {
        workspace_id: id,
        plan_key: (patch.plan_key as string) ?? PLAN_KEYS.CORE,
        term: 'monthly',
        mode: 'manual',
        status: 'active',
        is_comped: false,
        has_instagram: patch.has_instagram === true,
        has_google_growth: patch.has_google_growth === true,
        current_period_start: todayIST,
        current_period_end: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(farEnd),
      },
      { onConflict: 'workspace_id' },
    );
    if (error) { console.error('[admin addons create]', error); return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 }); }
    return NextResponse.json({ ok: true, created: true });
  }

  const { error } = await db.from('subscriptions').update(patch).eq('id', existing.id);
  if (error) { console.error('[admin addons]', error); return NextResponse.json({ error: 'Failed to update add-ons' }, { status: 500 }); }
  return NextResponse.json({ ok: true });
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

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { loadSpendRowsAdmin } from '@/lib/meta-spend-load';
import { resolveRange, aggregateByCurrency, aggregateByClient, aggregateByDate } from '@/lib/meta-spend';

// Same is_platform_admin gate as app/api/admin/meta-billing/route.ts — copied verbatim.
async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  return profile?.is_platform_admin ? db : null;
}

// GET — platform-wide Meta spend aggregates. Strictly is_platform_admin-gated;
// meta_spend_daily / meta_spend_sync are RLS deny-all so this uses the
// service-role admin client to read across ALL workspaces.
export async function GET(req: NextRequest) {
  const db = await checkAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const range = sp.get('from') && sp.get('to')
      ? { from: sp.get('from')!, to: sp.get('to')! }
      : resolveRange('last_30_days', now);

    // Uncapped read across ALL workspaces for the range — paginateAll pages
    // past PostgREST's 1000-row cap so platform totals never undercount.
    const rows = await loadSpendRowsAdmin(db, range.from, range.to);

    const workspaceIds = [...new Set(rows.map((r) => r.workspace_id))];
    const names = new Map<string, string>();
    if (workspaceIds.length > 0) {
      const { data: workspaces } = await db.from('workspaces').select('id, name').in('id', workspaceIds);
      for (const w of workspaces ?? []) names.set(w.id, w.name ?? w.id);
    }

    // Currencies can differ per workspace — never sum across currencies into
    // one number. Group/label totals by currency instead.
    const totals   = aggregateByCurrency(rows);
    const by_client = aggregateByClient(rows, names);
    const by_date   = aggregateByDate(rows);

    // Last-synced freshness per workspace, from the most recent sync attempts
    // (any status) — not scoped to the selected range, so it always reflects
    // the true last sync time even when viewing a historical range.
    const { data: recentSyncs } = await db
      .from('meta_spend_sync')
      .select('workspace_id, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    const lastSyncedAt = new Map<string, string>();
    for (const s of recentSyncs ?? []) {
      if (!lastSyncedAt.has(s.workspace_id)) lastSyncedAt.set(s.workspace_id, s.created_at);
    }
    const by_client_with_sync = by_client.map((c) => ({
      ...c,
      last_synced_at: lastSyncedAt.get(c.workspace_id) ?? null,
    }));

    // Recent sync failures — last 20 across ALL workspaces (not range-scoped),
    // so operators see failures even outside the currently-viewed window.
    const { data: failureRows, error: failErr } = await db
      .from('meta_spend_sync')
      .select('workspace_id, error, created_at, workspaces(name)')
      .eq('status', 'error')
      .order('created_at', { ascending: false })
      .limit(20);

    if (failErr) return NextResponse.json({ error: failErr.message }, { status: 500 });

    const recent_failures = (failureRows ?? []).map((f: any) => ({
      workspace_id: f.workspace_id,
      name:         f.workspaces?.name ?? f.workspace_id,
      error:        f.error,
      created_at:   f.created_at,
    }));

    return NextResponse.json({
      from: range.from,
      to:   range.to,
      totals,
      by_client: by_client_with_sync,
      by_date,
      recent_failures,
    });
  } catch (error) {
    console.error('[admin/meta-spend]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

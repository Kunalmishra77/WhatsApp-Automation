// app/api/admin/analytics/dashboard/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { monthsForTerm, type Term } from '@/lib/billing';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() as any;
  const { data: p } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  return p?.is_platform_admin ? db : null;
}

export async function GET(_req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now    = new Date();
  const localYM = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // 7 calendar-month boundaries (index i = 1st of month, index 6 = 1st of the month
  // *after* the 6th trend month) — shared by the message-volume, revenue and
  // client-growth trends below so all three line up on the same buckets.
  const monthBoundaries = Array.from({ length: 7 }, (_, i) =>
    new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));

  const [wsRes, msgMonthCountRes, campCountRes] = await Promise.all([
    db.from('workspaces')
      .select('id, name, plan, is_active, subscription_status, created_at')
      .is('deleted_at', null),

    // Platform-wide "this month" message count — exact, uncapped. Replaces the old
    // bare `.select('workspace_id')` that PostgREST silently truncated at 1000 rows
    // once the platform passed ~1000 messages/month.
    db.from('messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart),

    // Campaigns count only — no rows fetched
    db.from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', monthStart),
  ]);

  const workspaces: any[]     = wsRes.data ?? [];
  const msgThisMonth: number  = msgMonthCountRes.count ?? 0;
  const campThisMonth: number = campCountRes.count ?? 0;

  // ── What each client actually pays, per month ────────────────────────────────
  // This used to be read off workspaces.plan through PLAN_DISPLAY, which priced an
  // "enterprise" label at ₹9,999 and counted comped clients as paying customers.
  // Neither is true: that column gates Flows and CRM and has nothing to do with
  // billing, and a comped client pays nothing by definition. Revenue comes from the
  // subscription and the price list, the same source the Billing page uses, so the
  // two pages agree.
  const [subsRes, plansRes] = await Promise.all([
    db.from('subscriptions')
      .select('workspace_id, plan_key, term, status, is_comped, has_instagram, has_google_growth'),
    db.from('billing_plans').select('key, term, total_paise'),
  ]);

  const planByKeyTerm = new Map(
    (plansRes.data ?? []).map((p: any) => [`${p.key}::${p.term}`, p]),
  );
  const addOnMonthlyRupees = (key: string): number => {
    const row: any = planByKeyTerm.get(`${key}::monthly`);
    if (!row) {
      console.error(`[AdminDashboard] no billing_plans row for add-on "${key}" (monthly) — priced at 0`);
      return 0;
    }
    return row.total_paise / 100;
  };
  const igMonthly     = addOnMonthlyRupees('instagram_addon');
  const googleMonthly = addOnMonthlyRupees('google_growth_addon');

  // Monthly-equivalent rupees per workspace. A yearly subscription contributes a
  // twelfth of its price rather than inflating the month it falls in.
  const revenueByWs = new Map<string, number>();
  for (const sub of (subsRes.data ?? []) as any[]) {
    if (sub.is_comped === true || sub.status !== 'active') {
      revenueByWs.set(sub.workspace_id, 0);
      continue;
    }
    const term = sub.term ?? 'monthly';
    const plan: any = planByKeyTerm.get(`${sub.plan_key}::${term}`);
    if (!plan) {
      // A subscription pointing at a plan row that no longer exists would silently
      // undercount revenue with no signal.
      console.error(`[AdminDashboard] no billing_plans row for "${sub.plan_key}::${term}" (workspace ${sub.workspace_id}) — skipped`);
      revenueByWs.set(sub.workspace_id, 0);
      continue;
    }
    let rupees = plan.total_paise / 100 / monthsForTerm(term as Term);
    // All-in-One already contains both add-ons; only Core charges them separately.
    if (sub.plan_key !== 'all_in_one') {
      if (sub.has_instagram === true)     rupees += igMonthly;
      if (sub.has_google_growth === true) rupees += googleMonthly;
    }
    revenueByWs.set(sub.workspace_id, rupees);
  }
  const revenueOf = (wsId: string): number => revenueByWs.get(wsId) ?? 0;

  // What to call a client's plan in the admin UI, from the subscription rather than
  // the legacy label.
  const subByWs = new Map((subsRes.data ?? []).map((s: any) => [s.workspace_id, s]));
  const planLabelOf = (wsId: string): string => {
    const s: any = subByWs.get(wsId);
    if (!s) return 'No subscription';
    if (s.is_comped === true) return 'Comped';
    if (s.plan_key === 'all_in_one') return 'All-in-One';
    const extras = [
      s.has_instagram === true ? 'Instagram' : null,
      s.has_google_growth === true ? 'Google' : null,
    ].filter(Boolean);
    return extras.length ? `Core + ${extras.join(' + ')}` : 'Core';
  };

  // Platform-wide message volume trend (sent vs received), 6 calendar months — one
  // month-bucketed pass (migration 136) where this was 12 exact counts, 2 directions
  // × 6 months, each scanning the table: 204 calls at 92.9 ms. No workspace filter,
  // because admin routes aggregate across ALL workspaces.
  //
  // The boundaries above are built with `new Date(y, m, 1)` and labelled with
  // toLocaleDateString, so they are calendar months in the SERVER's timezone. The
  // RPC is told that zone by name so it buckets on the same calendar — reading the
  // zone rather than assuming UTC is what keeps a month's traffic in the month the
  // label claims, whatever the container is set to.
  const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const { data: volumeRows } = await db.rpc('admin_message_volume_monthly', {
    p_from: monthBoundaries[0]!.toISOString(),
    p_to:   monthBoundaries[6]!.toISOString(),
    p_tz:   serverTz,
  });

  const volumeByMonth = new Map<string, { sent: number; received: number }>();
  for (const row of (volumeRows ?? []) as Array<{ month: string; direction: string; cnt: number }>) {
    const key = String(row.month).slice(0, 7);   // the RPC returns a date: YYYY-MM-01
    const bucket = volumeByMonth.get(key) ?? { sent: 0, received: 0 };
    if (row.direction === 'outbound')     bucket.sent     += Number(row.cnt ?? 0);
    else if (row.direction === 'inbound') bucket.received += Number(row.cnt ?? 0);
    volumeByMonth.set(key, bucket);
  }

  // Every month in the window appears, including one with no traffic — the chart
  // needs six points, not however many months happened to have messages.
  const message_volume = monthBoundaries.slice(0, 6).map((d) => ({
    date:     d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    sent:     volumeByMonth.get(monthKey(d))?.sent ?? 0,
    received: volumeByMonth.get(monthKey(d))?.received ?? 0,
  }));

  // Per-workspace message count *this month* → health scores + top clients. One
  // exact, workspace-scoped count per workspace instead of a capped bare select +
  // JS tally (the old code silently under-counted every workspace once platform-wide
  // messages-this-month passed 1000, and worse, could show a workspace as having 0
  // messages just because it lost the race for the first 1000 rows).
  const msgCountByWs = new Map<string, number>();
  await Promise.all(workspaces.map(async (w: any) => {
    const { count } = await db.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', w.id)
      .gte('created_at', monthStart);
    msgCountByWs.set(w.id, count ?? 0);
  }));

  // KPIs
  const active = workspaces.filter((w: any) => w.is_active && w.subscription_status === 'active').length;
  const halted = workspaces.filter((w: any) => w.subscription_status === 'halted').length;
  const mrr    = Math.round(workspaces.reduce((acc: number, w: any) => {
    if (!w.is_active || w.subscription_status !== 'active') return acc;
    return acc + revenueOf(w.id);
  }, 0));
  const new7d = workspaces.filter((w: any) => w.created_at > sevenDaysAgo).length;

  // Health scores
  const healthScores = workspaces.map((w: any) => {
    const msgs = msgCountByWs.get(w.id) ?? 0;
    if (!w.is_active || w.subscription_status !== 'active') return 20;
    if (msgs > 500) return 95;
    if (msgs > 100) return 80;
    if (msgs > 10)  return 65;
    return 40;
  });
  const avg_health_score = healthScores.length
    ? Math.round(healthScores.reduce((a: number, b: number) => a + b, 0) / healthScores.length)
    : 0;

  // Revenue trend
  const revenue_trend = monthBoundaries.slice(0, 6).map((d) => {
    const mStr = localYM(d);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    const activeWs = workspaces.filter((w: any) => {
      const created = w.created_at ? localYM(new Date(w.created_at)) : '2020-01';
      return created <= mStr && w.is_active && w.subscription_status === 'active';
    });
    const mrrAtTime = Math.round(activeWs.reduce((acc: number, w: any) =>
      acc + revenueOf(w.id), 0));
    return { month: label, mrr: mrrAtTime, clients: activeWs.length };
  });

  // Client growth
  const client_growth = monthBoundaries.slice(0, 6).map((d) => {
    const mStr = localYM(d);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    const newInMonth = workspaces.filter((w: any) =>
      w.created_at ? localYM(new Date(w.created_at)) === mStr : false
    ).length;
    const totalByEnd = workspaces.filter((w: any) => {
      const created = w.created_at ? localYM(new Date(w.created_at)) : '2020-01';
      return created <= mStr;
    }).length;
    return { month: label, new: newInMonth, total: totalByEnd };
  });

  // Plan distribution
  const planMap: Record<string, { count: number; revenue: number }> = {};
  for (const w of workspaces) {
    const label = planLabelOf(w.id);
    if (!planMap[label]) planMap[label] = { count: 0, revenue: 0 };
    const entry = planMap[label]!;
    entry.count++;
    if (w.is_active && w.subscription_status === 'active')
      entry.revenue += revenueOf(w.id);
  }
  for (const entry of Object.values(planMap)) entry.revenue = Math.round(entry.revenue);
  const plan_distribution = Object.entries(planMap).map(([plan, v]) => ({ plan, ...v }));

  // Top 5 clients by this-month message activity
  const top_clients = workspaces
    .map((w: any, idx: number) => ({
      id:       w.id,
      name:     w.name,
      plan:     planLabelOf(w.id),
      messages: msgCountByWs.get(w.id) ?? 0,
      health:   healthScores[idx] ?? 50,
    }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 5);

  return NextResponse.json({
    kpis: {
      total_workspaces: workspaces.length,
      active_workspaces: active,
      halted_workspaces: halted,
      mrr,
      arr: mrr * 12,
      messages_this_month: msgThisMonth,
      campaigns_this_month: campThisMonth,
      new_clients_7d: new7d,
      avg_health_score,
    },
    revenue_trend, message_volume, client_growth, plan_distribution, top_clients,
  });
}

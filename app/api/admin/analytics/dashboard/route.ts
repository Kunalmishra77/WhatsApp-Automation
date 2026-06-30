// app/api/admin/analytics/dashboard/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { PLAN_DISPLAY } from '@/lib/plan-features';

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

  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [wsRes, msgMonthRes, msgTrendRes, campCountRes] = await Promise.all([
    db.from('workspaces')
      .select('id, name, plan, is_active, subscription_status, created_at')
      .is('deleted_at', null),

    // This month: only workspace_id needed (no direction, no created_at)
    db.from('messages')
      .select('workspace_id')
      .gte('created_at', monthStart),

    // Last 6 months for trend chart: need direction + created_at
    db.from('messages')
      .select('direction, created_at')
      .gte('created_at', sixMonthsAgo),

    // Campaigns count only — no rows fetched
    db.from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', monthStart),
  ]);

  const workspaces: any[]    = wsRes.data ?? [];
  const msgMonthRows: any[]  = msgMonthRes.data ?? [];
  const msgTrendRows: any[]  = msgTrendRes.data ?? [];
  const campThisMonth: number = campCountRes.count ?? 0;

  // KPIs
  const active = workspaces.filter((w: any) => w.is_active && w.subscription_status === 'active').length;
  const halted = workspaces.filter((w: any) => w.subscription_status === 'halted').length;
  const mrr    = workspaces.reduce((acc: number, w: any) => {
    if (!w.is_active || w.subscription_status !== 'active') return acc;
    return acc + ((PLAN_DISPLAY as any)[w.plan?.toLowerCase()]?.price ?? 0);
  }, 0);
  const msgThisMonth = msgMonthRows.length;
  const new7d = workspaces.filter((w: any) => w.created_at > sevenDaysAgo).length;

  // Per-workspace message count this month → health scores + top clients
  const msgCountByWs = new Map<string, number>();
  for (const m of msgMonthRows) {
    msgCountByWs.set(m.workspace_id, (msgCountByWs.get(m.workspace_id) ?? 0) + 1);
  }

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
  const revenue_trend = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const mStr = localYM(d);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    const activeWs = workspaces.filter((w: any) => {
      const created = w.created_at ? localYM(new Date(w.created_at)) : '2020-01';
      return created <= mStr && w.is_active && w.subscription_status === 'active';
    });
    const mrrAtTime = activeWs.reduce((acc: number, w: any) =>
      acc + ((PLAN_DISPLAY as any)[w.plan?.toLowerCase()]?.price ?? 0), 0);
    return { month: label, mrr: mrrAtTime, clients: activeWs.length };
  });

  // Message volume trend (direction breakdown for chart)
  const message_volume = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - 4 + i, 1);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    const inRange = msgTrendRows.filter((m: any) =>
      m.created_at >= d.toISOString() && m.created_at < next.toISOString()
    );
    return {
      date:     label,
      sent:     inRange.filter((m: any) => m.direction === 'outbound').length,
      received: inRange.filter((m: any) => m.direction === 'inbound').length,
    };
  });

  // Client growth
  const client_growth = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
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
    const planKey = w.plan?.toLowerCase() ?? 'free';
    if (!planMap[planKey]) planMap[planKey] = { count: 0, revenue: 0 };
    const entry = planMap[planKey]!;
    entry.count++;
    if (w.is_active && w.subscription_status === 'active')
      entry.revenue += (PLAN_DISPLAY as any)[planKey]?.price ?? 0;
  }
  const plan_distribution = Object.entries(planMap).map(([plan, v]) => ({ plan, ...v }));

  // Top 5 clients by this-month message activity
  const top_clients = workspaces
    .map((w: any, idx: number) => ({
      id:       w.id,
      name:     w.name,
      plan:     w.plan ?? 'free',
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

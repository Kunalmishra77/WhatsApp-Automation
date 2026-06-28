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
  const month  = now.toISOString().slice(0, 7);

  // Parallel data fetch
  const [wsRes, usageRes] = await Promise.all([
    db.from('workspaces').select('id, name, plan, is_active, subscription_status, created_at').is('deleted_at', null),
    db.from('platform_usage_logs').select('workspace_id, month, messages_sent, messages_in, campaigns_run, contacts_created').gte('month', new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 7)),
  ]);

  const workspaces: any[] = wsRes.data ?? [];
  const usageLogs: any[]  = usageRes.data ?? [];

  // KPIs
  const active   = workspaces.filter((w: any) => w.is_active && w.subscription_status === 'active').length;
  const halted   = workspaces.filter((w: any) => w.subscription_status === 'halted').length;
  const mrr      = workspaces.reduce((acc: number, w: any) => {
    if (!w.is_active || w.subscription_status !== 'active') return acc;
    return acc + ((PLAN_DISPLAY as any)[w.plan]?.price ?? 0);
  }, 0);
  const msgThisMonth = usageLogs.filter((u: any) => u.month.startsWith(month)).reduce((a: number, u: any) => a + (u.messages_sent ?? 0), 0);
  const campThisMonth = usageLogs.filter((u: any) => u.month.startsWith(month)).reduce((a: number, u: any) => a + (u.campaigns_run ?? 0), 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const new7d = workspaces.filter((w: any) => w.created_at > sevenDaysAgo).length;

  // Health scores (simple: based on messages sent this month relative to plan limits)
  const healthScores = workspaces.map((w: any) => {
    const usage = usageLogs.find((u: any) => u.workspace_id === w.id && u.month.startsWith(month));
    const msgs  = usage?.messages_sent ?? 0;
    const limit = (PLAN_DISPLAY as any)[w.plan]?.limits?.messages_per_month ?? 1000;
    const utilization = Math.min(100, Math.round((msgs / limit) * 100));
    const isActive = w.is_active && w.subscription_status === 'active';
    return isActive ? Math.max(20, Math.min(100, utilization > 5 ? 60 + utilization * 0.4 : 40)) : 20;
  });
  const avg_health_score = healthScores.length ? Math.round(healthScores.reduce((a: number, b: number) => a + b, 0) / healthScores.length) : 0;

  // Revenue trend (last 6 months)
  const revenue_trend = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const mStr = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    const activeAtTime = workspaces.filter((w: any) => w.created_at.slice(0, 7) <= mStr && w.is_active).length;
    const mrrAtTime = workspaces.filter((w: any) => w.created_at.slice(0, 7) <= mStr && w.is_active && w.subscription_status === 'active')
      .reduce((acc: number, w: any) => acc + ((PLAN_DISPLAY as any)[w.plan]?.price ?? 0), 0);
    return { month: label, mrr: mrrAtTime, clients: activeAtTime };
  });

  // Message volume (by month from usage logs, last 6)
  const message_volume = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const mStr = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    const logs  = usageLogs.filter((u: any) => u.month.startsWith(mStr));
    return { date: label, sent: logs.reduce((a: number, u: any) => a + (u.messages_sent ?? 0), 0), received: logs.reduce((a: number, u: any) => a + (u.messages_in ?? 0), 0) };
  });

  // Client growth
  const client_growth = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const mStr = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    const newInMonth  = workspaces.filter((w: any) => w.created_at.slice(0, 7) === mStr).length;
    const totalByEnd  = workspaces.filter((w: any) => w.created_at.slice(0, 7) <= mStr).length;
    return { month: label, new: newInMonth, total: totalByEnd };
  });

  // Plan distribution
  const planMap: Record<string, { count: number; revenue: number }> = {};
  for (const w of workspaces) {
    if (!planMap[w.plan]) planMap[w.plan] = { count: 0, revenue: 0 };
    planMap[w.plan].count++;
    if (w.is_active && w.subscription_status === 'active') planMap[w.plan].revenue += (PLAN_DISPLAY as any)[w.plan]?.price ?? 0;
  }
  const plan_distribution = Object.entries(planMap).map(([plan, v]) => ({ plan, ...v }));

  // Top clients by message volume this month
  const thisMonthUsage = usageLogs.filter((u: any) => u.month.startsWith(month));
  const top_clients = thisMonthUsage
    .sort((a: any, b: any) => b.messages_sent - a.messages_sent)
    .slice(0, 5)
    .map((u: any) => {
      const w = workspaces.find((ws: any) => ws.id === u.workspace_id);
      const idx = workspaces.indexOf(w);
      return { id: u.workspace_id, name: w?.name ?? u.workspace_id, plan: w?.plan ?? 'free', messages: u.messages_sent ?? 0, health: healthScores[idx] ?? 50 };
    });

  return NextResponse.json({
    kpis: { total_workspaces: workspaces.length, active_workspaces: active, halted_workspaces: halted, mrr, arr: mrr * 12, messages_this_month: msgThisMonth, campaigns_this_month: campThisMonth, new_clients_7d: new7d, avg_health_score },
    revenue_trend, message_volume, client_growth, plan_distribution, top_clients,
  });
}

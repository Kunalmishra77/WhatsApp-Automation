// app/api/admin/analytics/client/[id]/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() as any;
  const { data: p } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  return p?.is_platform_admin ? db : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: workspaceId } = await params;
  const now   = new Date();
  const month = now.toISOString().slice(0, 7);

  // Last-30-days window for the message trend chart. p_to is exclusive (matches
  // lib/date-range.ts convention); using "now" as the exclusive upper bound is
  // equivalent to the original's unbounded `.gte()` since no message can have a
  // future created_at.
  const trendFromUtc = new Date(Date.now() - 30 * 86400000).toISOString();
  const trendToUtc   = now.toISOString();

  const [contactsRes, convsRes, campsRes, msgCountRes, trendRes] = await Promise.all([
    db.from('contacts').select('id, created_at').eq('workspace_id', workspaceId),
    db.from('conversations').select('id, status, created_at, last_message_at').eq('workspace_id', workspaceId),
    // ALL campaigns — with all count fields
    db.from('campaigns').select('id, name, status, sent_count, delivered_count, read_count, replied_count, failed_count, created_at')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(20),
    // All-time message count using COUNT (avoids 1000-row limit)
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    // Last 30 days messages for trend chart — via analytics_message_daily (migration
    // 064), uncapped: replaces the old bare `.select('direction, created_at')` that
    // PostgREST silently truncated at 1000 rows once a workspace passed ~33
    // messages/day over the window.
    db.rpc('analytics_message_daily', { p_workspace: workspaceId, p_from: trendFromUtc, p_to: trendToUtc }),
  ]);

  const contacts: any[] = contactsRes.data ?? [];
  const convs: any[]    = convsRes.data ?? [];
  const campsRaw: any[] = campsRes.data ?? [];
  const totalMsgCount   = (msgCountRes as any)?.count ?? 0;

  type TrendRow = { day: string; direction: string; cnt: number | string };
  const trendRows = (trendRes.data ?? []) as TrendRow[];

  // Get LIVE replied counts from campaign_recipients (more accurate than campaigns.replied_count)
  // campaigns.replied_count can be stale for recently-completed campaigns
  const campIds: string[] = campsRaw.map((c: any) => c.id);
  let repliedMap = new Map<string, number>();
  if (campIds.length > 0) {
    const { data: repliedRows } = await db
      .from('campaign_recipients')
      .select('campaign_id')
      .in('campaign_id', campIds)
      .eq('status', 'replied');
    for (const r of repliedRows ?? []) {
      repliedMap.set(r.campaign_id, (repliedMap.get(r.campaign_id) ?? 0) + 1);
    }
  }

  // Merge live replied counts into campaign data
  const camps = campsRaw.map((c: any) => ({
    ...c,
    replied_count: repliedMap.get(c.id) ?? c.replied_count ?? 0,
  }));

  // Monthly message volume (30 days) — built from the uncapped RPC rows, plus bot
  // response rate derived from the same single pass (previously a separate
  // outbound/inbound `.filter().length` over the same, now-removed capped select).
  const msgByDay: Record<string, { sent: number; received: number }> = {};
  let outbound = 0, inbound = 0;
  for (const row of trendRows) {
    const cnt = Number(row.cnt);
    const day = row.day.slice(0, 10);
    if (!msgByDay[day]) msgByDay[day] = { sent: 0, received: 0 };
    if (row.direction === 'outbound') { msgByDay[day].sent += cnt; outbound += cnt; }
    else { msgByDay[day].received += cnt; inbound += cnt; }
  }
  const message_trend = Array.from({ length: 30 }, (_, i) => {
    const d   = new Date(Date.now() - (29 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), ...(msgByDay[key] ?? { sent: 0, received: 0 }) };
  });

  // Bot response rate
  const bot_response_rate = inbound > 0 ? Math.round((outbound / inbound) * 100) : 0;

  // Health score — based on actual all-time message count
  const msgThisMonth = totalMsgCount;
  const health_score = Math.max(20, Math.min(100, msgThisMonth > 500 ? 95 : msgThisMonth > 100 ? 85 : msgThisMonth > 10 ? 65 : 40));

  // Contact growth by month
  const contact_growth = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const mStr = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    return { month: label, count: contacts.filter((c: any) => c.created_at.slice(0, 7) <= mStr).length };
  });

  // Campaign stats — show all fetched campaigns (up to 20) with real counts
  const campaign_stats = camps.map((c: any) => ({
    name:      c.name,
    sent:      c.sent_count ?? 0,
    delivered: c.delivered_count ?? 0,
    read:      c.read_count ?? 0,
    replied:   c.replied_count ?? 0,
    failed:    c.failed_count ?? 0,
    status:    c.status,
    created_at: c.created_at,
  }));

  // Totals from campaigns
  const totalSent      = camps.reduce((a: number, c: any) => a + (c.sent_count ?? 0), 0);
  const totalDelivered = camps.reduce((a: number, c: any) => a + (c.delivered_count ?? 0), 0);
  const totalReplied   = camps.reduce((a: number, c: any) => a + (c.replied_count ?? 0), 0);

  return NextResponse.json({
    kpis: {
      messages_this_month: msgThisMonth,   // all-time conversation messages
      contacts_total:      contacts.length,
      conversations_total: convs.length,
      campaigns_total:     camps.length,
      campaign_sent_total: totalSent,      // total campaign messages sent
      campaign_delivered:  totalDelivered,
      campaign_replied:    totalReplied,
      bot_response_rate,
      health_score,
    },
    message_trend,
    campaign_stats,
    contact_growth,
  });
}

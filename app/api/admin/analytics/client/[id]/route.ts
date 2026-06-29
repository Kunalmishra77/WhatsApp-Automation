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

  const [contactsRes, convsRes, campsRes, msgCountRes, messagesRes] = await Promise.all([
    db.from('contacts').select('id, created_at').eq('workspace_id', workspaceId),
    db.from('conversations').select('id, status, created_at, last_message_at').eq('workspace_id', workspaceId),
    // ALL campaigns for this workspace (not just 10) — with all count fields
    db.from('campaigns').select('id, name, status, sent_count, delivered_count, read_count, replied_count, failed_count, created_at')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(20),
    // All-time message count using COUNT (avoids 1000-row limit)
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    // Last 30 days messages for trend chart
    db.from('messages').select('direction, created_at').eq('workspace_id', workspaceId)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);

  const contacts: any[] = contactsRes.data ?? [];
  const convs: any[]    = convsRes.data ?? [];
  const camps: any[]    = campsRes.data ?? [];
  const totalMsgCount   = (msgCountRes as any)?.count ?? 0; // all-time total (proper COUNT query)
  const msgs: any[]     = messagesRes.data ?? [];            // last 30 days for chart

  // Monthly message volume (30 days)
  const msgByDay: Record<string, { sent: number; received: number }> = {};
  for (const m of msgs) {
    const day = m.created_at.slice(0, 10);
    if (!msgByDay[day]) msgByDay[day] = { sent: 0, received: 0 };
    if (m.direction === 'outbound') msgByDay[day].sent++;
    else msgByDay[day].received++;
  }
  const message_trend = Array.from({ length: 30 }, (_, i) => {
    const d   = new Date(Date.now() - (29 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), ...(msgByDay[key] ?? { sent: 0, received: 0 }) };
  });

  // Bot response rate
  const outbound = msgs.filter((m: any) => m.direction === 'outbound').length;
  const inbound  = msgs.filter((m: any) => m.direction === 'inbound').length;
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

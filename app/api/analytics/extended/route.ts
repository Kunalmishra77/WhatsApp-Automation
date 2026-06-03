import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/analytics/extended?workspaceId=&from=&to=
// Returns: campaign perf, lead funnel, sentiment, flow stats, contact temperature
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');
    const from        = searchParams.get('from');
    const to          = searchParams.get('to');

    if (!workspaceId || !from || !to) {
      return NextResponse.json({ error: 'workspaceId, from, to required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // ── 1. Campaign Performance ──────────────────────────────────────────────
    const { data: campaigns } = await db
      .from('campaigns')
      .select('id, name, status, total_recipients, sent_count, delivered_count, read_count, failed_count, ab_test_group, created_at, templates(name)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(10);

    type CampaignRow = {
      id: string; name: string; status: string;
      total_recipients: number | null; sent_count: number | null;
      delivered_count: number | null; read_count: number | null;
      failed_count: number | null; ab_test_group: string | null;
      created_at: string; templates: { name: string } | null;
    };

    const campaignStats = (campaigns ?? [] as CampaignRow[]).map((c: CampaignRow) => {
      const total     = c.total_recipients ?? 0;
      const delivered = c.delivered_count  ?? 0;
      const read      = c.read_count       ?? 0;
      return {
        id:           c.id,
        name:         c.name,
        template:     c.templates?.name ?? '—',
        status:       c.status,
        total,
        delivered,
        read,
        failed:       c.failed_count ?? 0,
        deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
        readRate:     total > 0 ? Math.round((read / total) * 100) : 0,
        abGroup:      c.ab_test_group,
        createdAt:    c.created_at,
      };
    });

    // Campaign summary counts
    const allCampaigns = campaigns ?? [] as CampaignRow[];
    const campaignSummary = {
      total:     allCampaigns.length,
      completed: allCampaigns.filter((c: CampaignRow) => c.status === 'completed').length,
      running:   allCampaigns.filter((c: CampaignRow) => c.status === 'running').length,
      failed:    allCampaigns.filter((c: CampaignRow) => c.status === 'failed').length,
      draft:     allCampaigns.filter((c: CampaignRow) => c.status === 'draft' || c.status === 'scheduled').length,
      totalSent: allCampaigns.reduce((s: number, c: CampaignRow) => s + (c.sent_count ?? 0), 0),
    };

    // ── 2. Lead Funnel (by stage) ────────────────────────────────────────────
    const { data: leadsRaw } = await db
      .from('leads')
      .select('stage, temperature, priority, ai_score, created_at')
      .eq('workspace_id', workspaceId)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    type LeadRow = { stage: string; temperature: string; priority: string; ai_score: number | null; created_at: string };
    const leads = (leadsRaw ?? []) as LeadRow[];

    const stageOrder = ['new', 'contacted', 'follow_up', 'interested', 'converted', 'lost'];
    const stageMap: Record<string, number> = {};
    const tempMap:  Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    const prioMap:  Record<string, number> = { low: 0, medium: 0, high: 0 };
    let aiScoreSum = 0, aiScoreCount = 0;

    for (const l of leads) {
      stageMap[l.stage] = (stageMap[l.stage] ?? 0) + 1;
      if (l.temperature in tempMap) tempMap[l.temperature as 'hot'|'warm'|'cold'] = (tempMap[l.temperature as 'hot'|'warm'|'cold'] ?? 0) + 1;
      if (l.priority in prioMap)   prioMap[l.priority as 'low'|'medium'|'high'] = (prioMap[l.priority as 'low'|'medium'|'high'] ?? 0) + 1;
      if (l.ai_score != null) { aiScoreSum += l.ai_score; aiScoreCount++; }
    }

    const leadFunnel = stageOrder.map((s) => ({ stage: s, count: stageMap[s] ?? 0 }));
    const leadTemperature = [
      { label: 'Hot 🔥',  value: tempMap.hot  ?? 0, color: '#ef4444' },
      { label: 'Warm 🌡️', value: tempMap.warm ?? 0, color: '#f59e0b' },
      { label: 'Cold ❄️', value: tempMap.cold ?? 0, color: '#3b82f6' },
    ];
    const avgAiScore = aiScoreCount > 0 ? Math.round(aiScoreSum / aiScoreCount) : null;

    // ── 3. Sentiment Breakdown ───────────────────────────────────────────────
    const { data: convRaw } = await db
      .from('conversations')
      .select('sentiment, created_at')
      .eq('workspace_id', workspaceId)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    type ConvRow = { sentiment: string | null; created_at: string };
    const convSentiments = (convRaw ?? []) as ConvRow[];

    const sentMap: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
    const sentimentByDay: Record<string, { positive: number; neutral: number; negative: number }> = {};

    for (const c of convSentiments) {
      const s = (c.sentiment ?? 'neutral') as 'positive'|'neutral'|'negative';
      sentMap[s] = (sentMap[s] ?? 0) + 1;
      const day = c.created_at.slice(0, 10);
      if (!sentimentByDay[day]) sentimentByDay[day] = { positive: 0, neutral: 0, negative: 0 };
      const dayEntry = sentimentByDay[day]!;
      dayEntry[s] = (dayEntry[s] ?? 0) + 1;
    }

    const sentimentBreakdown = [
      { label: 'Positive', value: sentMap.positive ?? 0, color: '#10b981' },
      { label: 'Neutral',  value: sentMap.neutral  ?? 0, color: '#6b7280' },
      { label: 'Negative', value: sentMap.negative ?? 0, color: '#ef4444' },
    ];

    const sentimentTrend = Object.entries(sentimentByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: date.slice(5), ...v }));  // MM-DD format

    // ── 4. Contact Temperature Distribution ─────────────────────────────────
    const { data: contactTemps } = await db
      .from('contacts')
      .select('temperature')
      .eq('workspace_id', workspaceId);

    type ContactTempRow = { temperature: string | null };
    const ctMap: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    for (const c of (contactTemps ?? []) as ContactTempRow[]) {
      const t = (c.temperature ?? 'warm') as 'hot'|'warm'|'cold';
      ctMap[t] = (ctMap[t] ?? 0) + 1;
    }
    const contactTemperatureBreakdown = [
      { label: 'Hot',  value: ctMap.hot,  color: '#ef4444' },
      { label: 'Warm', value: ctMap.warm, color: '#f59e0b' },
      { label: 'Cold', value: ctMap.cold, color: '#3b82f6' },
    ];

    // ── 5. Flow Performance ──────────────────────────────────────────────────
    const { data: flowsRaw } = await db
      .from('chatbot_flows')
      .select('id, name, is_active, nodes')
      .eq('workspace_id', workspaceId);

    type FlowRow = { id: string; name: string; is_active: boolean; nodes: unknown[] | null };
    const flows = (flowsRaw ?? []) as FlowRow[];

    // Count sessions per flow
    const { data: sessionsRaw } = await db
      .from('flow_sessions')
      .select('flow_id, status')
      .eq('workspace_id', workspaceId)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`)
      .limit(5000);

    type SessionRow = { flow_id: string; status: string };
    const sessions = (sessionsRaw ?? []) as SessionRow[];
    const sessionMap: Record<string, { started: number; completed: number }> = {};

    for (const s of sessions) {
      if (!sessionMap[s.flow_id]) sessionMap[s.flow_id] = { started: 0, completed: 0 };
      sessionMap[s.flow_id]!.started++;
      if (s.status === 'completed') sessionMap[s.flow_id]!.completed++;
    }

    const flowStats = flows.map((f: FlowRow) => ({
      id:         f.id,
      name:       f.name,
      isActive:   f.is_active,
      nodeCount:  Array.isArray(f.nodes) ? f.nodes.length : 0,
      sessions:   sessionMap[f.id]?.started ?? 0,
      completed:  sessionMap[f.id]?.completed ?? 0,
      completionRate: (sessionMap[f.id]?.started ?? 0) > 0
        ? Math.round(((sessionMap[f.id]?.completed ?? 0) / (sessionMap[f.id]?.started ?? 0)) * 100)
        : 0,
    }));

    // ── 6. Message delivery funnel (for campaigns vs organic) ───────────────
    const { data: msgFunnelRaw } = await db
      .from('messages')
      .select('status, direction')
      .eq('workspace_id', workspaceId)
      .eq('direction', 'outbound')
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    type MsgFunnelRow = { status: string };
    const msgFunnel = (msgFunnelRaw ?? []) as MsgFunnelRow[];
    const funnelMap: Record<string, number> = { sent: 0, delivered: 0, read: 0, failed: 0 };
    for (const m of msgFunnel) {
      const s = m.status as 'sent'|'delivered'|'read'|'failed';
      if (s in funnelMap) funnelMap[s] = (funnelMap[s] ?? 0) + 1;
      if (s === 'read') {
        funnelMap.delivered = (funnelMap.delivered ?? 0) + 1;
        funnelMap.sent      = (funnelMap.sent ?? 0) + 1;
      } else if (s === 'delivered') {
        funnelMap.sent = (funnelMap.sent ?? 0) + 1;
      }
    }

    const deliveryFunnel = [
      { stage: 'Sent',      count: funnelMap.sent,      color: '#6366f1' },
      { stage: 'Delivered', count: funnelMap.delivered, color: '#10b981' },
      { stage: 'Read',      count: funnelMap.read,      color: '#f59e0b' },
      { stage: 'Failed',    count: funnelMap.failed,    color: '#ef4444' },
    ];

    return NextResponse.json({
      campaignSummary,
      campaignStats,
      leadFunnel,
      leadTemperature,
      avgAiScore,
      totalLeads: leads.length,
      sentimentBreakdown,
      sentimentTrend,
      contactTemperatureBreakdown,
      flowStats,
      deliveryFunnel,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Analytics Extended]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

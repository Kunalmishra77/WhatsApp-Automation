import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, type QuickRange } from '@/lib/date-range';
import { paginateAll } from '@/lib/export-stream';

// GET /api/analytics/extended?workspaceId=&quick=<preset>|&from=&to=
// Returns: campaign perf, lead funnel, sentiment, flow stats, contact temperature
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // ── 0. Resolve the reporting date range — same parsing as /api/analytics/overview:
    //      ?quick=<preset>, ?quick=custom&from=&to=, or bare ?from=&to= (implicit custom).
    //      Defaults to last_30_days only when nothing is given. ────────────────────────
    const rawFrom = searchParams.get('from') || undefined;
    const rawTo   = searchParams.get('to') || undefined;
    const quick = (searchParams.get('quick') || (rawFrom && rawTo ? 'custom' : 'last_30_days')) as QuickRange;
    const { fromUtc, toUtc } = resolveRange(quick, { from: rawFrom, to: rawTo });

    // ── 1. Campaign Performance (unchanged — already bounded by .limit(10), not
    //      part of this fix; not date-ranged by design, shows most-recent campaigns) ──
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

    // ── 2. Lead Funnel (by stage/temperature) — via the analytics_lead_breakdown SQL
    //      aggregation RPC (migration 064), uncapped: replaces the old bare `.select()`
    //      that silently truncated at 1000 rows. The RPC doesn't cover ai_score (no
    //      aggregate for it), so the average is computed via a light, ranged, uncapped
    //      column-only scan below instead. ────────────────────────────────────────────
    const { data: leadBreakdownRaw } = await db.rpc('analytics_lead_breakdown', {
      p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc,
    });

    type LeadBreakdownRow = { stage: string; temperature: string | null; cnt: number | string };
    const leadBreakdown = (leadBreakdownRaw ?? []) as LeadBreakdownRow[];

    const stageOrder = ['new', 'contacted', 'follow_up', 'interested', 'converted', 'lost'];
    const stageMap: Record<string, number> = {};
    const tempMap:  Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    let totalLeads = 0;

    for (const row of leadBreakdown) {
      const cnt = Number(row.cnt);
      totalLeads += cnt;
      stageMap[row.stage] = (stageMap[row.stage] ?? 0) + cnt;
      if (row.temperature && row.temperature in tempMap) {
        const t = row.temperature as 'hot' | 'warm' | 'cold';
        tempMap[t] = (tempMap[t] ?? 0) + cnt;
      }
    }

    const leadFunnel = stageOrder.map((s) => ({ stage: s, count: stageMap[s] ?? 0 }));
    const leadTemperature = [
      { label: 'Hot 🔥',  value: tempMap.hot  ?? 0, color: '#ef4444' },
      { label: 'Warm 🌡️', value: tempMap.warm ?? 0, color: '#f59e0b' },
      { label: 'Cold ❄️', value: tempMap.cold ?? 0, color: '#3b82f6' },
    ];

    // avgAiScore — no SUM/AVG RPC exists for ai_score, so page through *only* that
    // column, ranged + uncapped (replaces what used to be part of the same capped select).
    let aiScoreSum = 0, aiScoreCount = 0;
    type AiScoreRow = { ai_score: number | null };
    for await (const page of paginateAll<AiScoreRow>((offset, pageSize) =>
      db.from('leads')
        .select('ai_score')
        .eq('workspace_id', workspaceId)
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const l of page) {
        if (l.ai_score != null) { aiScoreSum += l.ai_score; aiScoreCount++; }
      }
    }
    const avgAiScore = aiScoreCount > 0 ? Math.round(aiScoreSum / aiScoreCount) : null;

    // ── 3. Sentiment Breakdown — ranged, exact bucket counts (uncapped) for the pie
    //      chart. The day-by-day trend needs row-level (day, sentiment) pairs with no
    //      RPC covering that shape, so it's a single paginated, ranged, uncapped scan. ─
    const [{ count: totalConvCount }, { count: positiveCount }, { count: negativeCount }] = await Promise.all([
      db.from('conversations').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).gte('created_at', fromUtc).lt('created_at', toUtc),
      db.from('conversations').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('sentiment', 'positive').gte('created_at', fromUtc).lt('created_at', toUtc),
      db.from('conversations').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('sentiment', 'negative').gte('created_at', fromUtc).lt('created_at', toUtc),
    ]);
    // 'neutral' == everything that's neither positive nor negative, including NULL
    // (matches the original in-JS fallback: `(c.sentiment ?? 'neutral')`).
    const neutralCount = Math.max(0, (totalConvCount ?? 0) - (positiveCount ?? 0) - (negativeCount ?? 0));

    const sentimentBreakdown = [
      { label: 'Positive', value: positiveCount ?? 0, color: '#10b981' },
      { label: 'Neutral',  value: neutralCount,        color: '#6b7280' },
      { label: 'Negative', value: negativeCount ?? 0,  color: '#ef4444' },
    ];

    const sentimentByDay: Record<string, { positive: number; neutral: number; negative: number }> = {};
    type ConvSentimentRow = { sentiment: string | null; created_at: string };
    for await (const page of paginateAll<ConvSentimentRow>((offset, pageSize) =>
      db.from('conversations')
        .select('sentiment, created_at')
        .eq('workspace_id', workspaceId)
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const c of page) {
        const s = (c.sentiment ?? 'neutral') as 'positive' | 'neutral' | 'negative';
        const day = c.created_at.slice(0, 10);
        if (!sentimentByDay[day]) sentimentByDay[day] = { positive: 0, neutral: 0, negative: 0 };
        const dayEntry = sentimentByDay[day]!;
        dayEntry[s] = (dayEntry[s] ?? 0) + 1;
      }
    }

    const sentimentTrend = Object.entries(sentimentByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: date.slice(5), ...v }));  // MM-DD format

    // ── 4. Contact Temperature Distribution — snapshot metric, intentionally
    //      all-time (matches the original, which had no date filter at all); now via
    //      exact counts instead of a bare capped `.select()`. ─────────────────────────
    const [{ count: totalContactsCount }, { count: hotCount }, { count: coldCount }] = await Promise.all([
      db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('temperature', 'hot'),
      db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('temperature', 'cold'),
    ]);
    // 'warm' == everything that's neither hot nor cold, including NULL (matches the
    // original in-JS fallback: `(c.temperature ?? 'warm')`).
    const warmCount = Math.max(0, (totalContactsCount ?? 0) - (hotCount ?? 0) - (coldCount ?? 0));
    const contactTemperatureBreakdown = [
      { label: 'Hot',  value: hotCount ?? 0, color: '#ef4444' },
      { label: 'Warm', value: warmCount,      color: '#f59e0b' },
      { label: 'Cold', value: coldCount ?? 0, color: '#3b82f6' },
    ];

    // ── 5. Flow Performance (unchanged — session count already bounded by
    //      .limit(5000) pre-existing, not part of this fix's audit scope) ─────────────
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
      .gte('created_at', fromUtc)
      .lt('created_at', toUtc)
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

    // ── 6. Message delivery funnel (outbound campaign traffic only) — 4 ranged,
    //      exact counts instead of a bare capped `.select()`. Deliberately NOT using
    //      the undirected analytics_message_status RPC: inbound messages are stored
    //      with status='delivered' at ingestion (see /api/analytics/overview + the
    //      whatsapp/instagram/meta webhooks), so an undirected status tally would
    //      inflate 'delivered' with inbound rows. This mirrors the outbound-only
    //      counting pattern already established in the overview route for the same
    //      reason. Cumulative-funnel semantics (read implies delivered implies sent)
    //      match the original JS reduction exactly. ──────────────────────────────────
    const [{ count: sentCount }, { count: deliveredCnt }, { count: readCnt }, { count: failedCnt }] = await Promise.all([
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .in('status', ['sent', 'delivered', 'read']).gte('created_at', fromUtc).lt('created_at', toUtc),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .in('status', ['delivered', 'read']).gte('created_at', fromUtc).lt('created_at', toUtc),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .eq('status', 'read').gte('created_at', fromUtc).lt('created_at', toUtc),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .eq('status', 'failed').gte('created_at', fromUtc).lt('created_at', toUtc),
    ]);

    const deliveryFunnel = [
      { stage: 'Sent',      count: sentCount ?? 0,    color: '#6366f1' },
      { stage: 'Delivered', count: deliveredCnt ?? 0, color: '#10b981' },
      { stage: 'Read',      count: readCnt ?? 0,      color: '#f59e0b' },
      { stage: 'Failed',    count: failedCnt ?? 0,    color: '#ef4444' },
    ];

    return NextResponse.json({
      campaignSummary,
      campaignStats,
      leadFunnel,
      leadTemperature,
      avgAiScore,
      totalLeads,
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

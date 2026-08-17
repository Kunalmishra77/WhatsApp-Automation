import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, addDays, type QuickRange } from '@/lib/date-range';
import { paginateAll } from '@/lib/export-stream';

export const runtime = 'nodejs';

// GET /api/dashboard/overview?workspaceId=&quick=<preset>|&from=&to=
// One aggregated, date-filterable payload for the command-center dashboard:
// headline KPIs (with %-change vs the previous equivalent period), messages,
// campaigns, leads, conversations, events. Uncapped, IST-correct, workspace-scoped.

// KPI %-change — null when there's no previous-period baseline to compare against
// (mirrors lib/meta-spend.ts pctChange, inlined here to avoid a billing-module import).
function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function kpi(current: number, previous: number) {
  return { value: current, pct_change: pctChange(current, previous) };
}

type DailyRow = { day: string; direction: string; cnt: number | string };
type ConvStatusRow = { status: string; cnt: number | string };
type LeadRow = { stage: string; temperature: string | null; cnt: number | string };
type CampaignTotalsRow = {
  status: string; campaigns: number | string; recipients: number | string;
  sent: number | string; delivered: number | string; read: number | string;
  replied: number | string; failed: number | string;
};
type ConvMetricsRow = { total: number | string; resolved: number | string; avg_first_response_secs: number | string | null };

// Sum of (inbound, outbound) message counts from analytics_message_daily rows —
// used for both windows (current payload data + previous-window KPI baseline).
function sumDirections(rows: DailyRow[]): { inbound: number; outbound: number } {
  let inbound = 0, outbound = 0;
  for (const r of rows) {
    const cnt = Number(r.cnt);
    if (r.direction === 'inbound') inbound += cnt; else outbound += cnt;
  }
  return { inbound, outbound };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // ── 0. Resolve the reporting date range (same parsing as /api/analytics/overview)
    //      + the previous equivalent window (same length, immediately before `fromUtc`)
    //      used only for the headline KPIs' %-change. ─────────────────────────────────
    const rawFrom = searchParams.get('from') || undefined;
    const rawTo   = searchParams.get('to') || undefined;
    const quick = (searchParams.get('quick') || (rawFrom && rawTo ? 'custom' : 'last_30_days')) as QuickRange;
    const { from, to, fromUtc, toUtc } = resolveRange(quick, { from: rawFrom, to: rawTo });

    const spanMs = new Date(toUtc).getTime() - new Date(fromUtc).getTime();
    const prevToUtc = fromUtc;
    const prevFromUtc = new Date(new Date(fromUtc).getTime() - spanMs).toISOString();

    // ── 1. Fan out every RPC/count for BOTH windows in one Promise.all. Current-window
    //      calls cover the full payload (messages/campaigns/leads/conversations/events);
    //      previous-window calls cover only what feeds KPI %-change (messages, leads,
    //      conversations, contacts) — campaigns/events/by-status have no prev counterpart
    //      in the payload shape. Uncapped: SQL-aggregation RPCs + count:'exact', no bare
    //      capped `.select()` anywhere. ──────────────────────────────────────────────────
    const [
      { data: dailyCur },
      { data: convStatusCur },
      { data: leadCur },
      { data: convMetricsCur },
      { data: campaignTotalsCur },
      { count: newContactsCur },
      { count: deliveredCur }, { count: readCur }, { count: sentCur }, { count: failedCur },
      { data: topCampaignsRaw },

      { data: dailyPrev },
      { data: leadPrev },
      { data: convMetricsPrev },
      { count: newContactsPrev },
      { count: deliveredPrev }, { count: readPrev },
    ] = await Promise.all([
      db.rpc('analytics_message_daily', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc, p_tz: 'Asia/Kolkata' }),
      db.rpc('analytics_conversation_status', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc }),
      db.rpc('analytics_lead_breakdown', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc }),
      db.rpc('analytics_conversation_metrics', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc }),
      db.rpc('analytics_campaign_totals', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc }),
      db.from('contacts').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).gte('created_at', fromUtc).lt('created_at', toUtc),
      // Outbound-scoped, cumulative-funnel status counts (deliberately NOT the undirected
      // status RPC — inbound rows are stored delivered/read at ingestion; see
      // analytics/overview + analytics/extended for the same pattern/rationale).
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .in('status', ['delivered', 'read']).gte('created_at', fromUtc).lt('created_at', toUtc),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .eq('status', 'read').gte('created_at', fromUtc).lt('created_at', toUtc),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .in('status', ['sent', 'delivered', 'read']).gte('created_at', fromUtc).lt('created_at', toUtc),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .eq('status', 'failed').gte('created_at', fromUtc).lt('created_at', toUtc),
      // Top campaigns by volume — bounded top-N, not a bare capped select.
      db.from('campaigns')
        .select('id, name, sent_count, replied_count')
        .eq('workspace_id', workspaceId)
        .gte('created_at', fromUtc).lt('created_at', toUtc)
        .order('sent_count', { ascending: false })
        .limit(6),

      db.rpc('analytics_message_daily', { p_workspace: workspaceId, p_from: prevFromUtc, p_to: prevToUtc, p_tz: 'Asia/Kolkata' }),
      db.rpc('analytics_lead_breakdown', { p_workspace: workspaceId, p_from: prevFromUtc, p_to: prevToUtc }),
      db.rpc('analytics_conversation_metrics', { p_workspace: workspaceId, p_from: prevFromUtc, p_to: prevToUtc }),
      db.from('contacts').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).gte('created_at', prevFromUtc).lt('created_at', prevToUtc),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .in('status', ['delivered', 'read']).gte('created_at', prevFromUtc).lt('created_at', prevToUtc),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'outbound')
        .eq('status', 'read').gte('created_at', prevFromUtc).lt('created_at', prevToUtc),
    ]);

    // ── 2. Events — no aggregation RPC exists; a single uncapped, ranged, column-only
    //      paginated scan (same convention as senderBreakdown/tagDistribution in
    //      analytics/overview) instead of a bare capped `.select()`. Current window only —
    //      the payload shape has no previous-period counterpart for events. ──────────────
    const eventMap: Record<string, number> = {};
    type EventRow = { event_type: string };
    for await (const page of paginateAll<EventRow>((offset, pageSize) =>
      db.from('conversation_events')
        .select('event_type')
        .eq('workspace_id', workspaceId)
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const row of page) {
        eventMap[row.event_type] = (eventMap[row.event_type] ?? 0) + 1;
      }
    }
    const events = Object.entries(eventMap).map(([type, count]) => ({ type, count }));

    // ── 3. Messages — direction totals from the ranged daily RPC (current + previous),
    //      outbound-scoped funnel counts (current) already fetched above. ────────────────
    const { inbound: inboundCur, outbound: outboundCur } = sumDirections((dailyCur ?? []) as DailyRow[]);
    const { inbound: inboundPrev, outbound: outboundPrev } = sumDirections((dailyPrev ?? []) as DailyRow[]);

    // Bucket granularity adapts to the range span so `all_time` (fromUtc = epoch) doesn't
    // build a ~20,000-point daily skeleton and freeze the chart. `label` stays a
    // 'YYYY-MM-DD' bucket-start date regardless of granularity — the UI's tickFormatter
    // slices `label`, so the field name/format can't change.
    const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
    const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
    const spanDays = (toMs - fromMs) / 86_400_000;
    const granularity: 'day' | 'week' | 'month' = spanDays <= 92 ? 'day' : spanDays <= 400 ? 'week' : 'month';

    // Maps an RPC row's 'YYYY-MM-DD' day to its bucket-start label. Week buckets step by
    // 7 days from the range start (no calendar-Monday snap needed); month buckets snap to
    // the 1st of the row's month.
    function bucketLabelFor(day: string): string {
      if (granularity === 'day') return day;
      if (granularity === 'month') return `${day.slice(0, 7)}-01`;
      const diffDays = Math.floor((new Date(`${day}T00:00:00.000Z`).getTime() - fromMs) / 86_400_000);
      return addDays(from, Math.floor(diffDays / 7) * 7);
    }

    const dailyMap: Record<string, { inbound: number; outbound: number }> = {};
    if (granularity === 'day') {
      for (let d = fromMs; d <= toMs; d += 86_400_000) {
        dailyMap[new Date(d).toISOString().slice(0, 10)] = { inbound: 0, outbound: 0 };
      }
    } else if (granularity === 'week') {
      for (let d = fromMs; d <= toMs; d += 7 * 86_400_000) {
        dailyMap[new Date(d).toISOString().slice(0, 10)] = { inbound: 0, outbound: 0 };
      }
    } else {
      const cursor = new Date(fromMs);
      cursor.setUTCDate(1);
      while (cursor.getTime() <= toMs) {
        dailyMap[cursor.toISOString().slice(0, 10)] = { inbound: 0, outbound: 0 };
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }
    for (const row of (dailyCur ?? []) as DailyRow[]) {
      const key = bucketLabelFor(row.day.slice(0, 10));
      if (!dailyMap[key]) dailyMap[key] = { inbound: 0, outbound: 0 };
      const bucket = dailyMap[key]!;
      const cnt = Number(row.cnt);
      if (row.direction === 'inbound') bucket.inbound += cnt; else bucket.outbound += cnt;
    }
    const messagesDaily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, v]) => ({ label, inbound: v.inbound, outbound: v.outbound }));

    // ── 4. Outbound-scoped rates (copy of the analytics/overview pattern): delivered/read
    //      counted only over outbound traffic, denominator is total outbound volume for the
    //      window (from the daily RPC) — not the funnel-scoped "sent" count — matching the
    //      existing /api/analytics/overview computation exactly. Divide-by-zero guarded. ──
    const deliveryRateCur = outboundCur > 0 ? Math.round(((deliveredCur ?? 0) / outboundCur) * 100) : 0;
    const readRateCur     = outboundCur > 0 ? Math.round(((readCur ?? 0) / outboundCur) * 100) : 0;
    // Reply rate = customer replies relative to what we sent, capped at 100%. Customers
    // often send more messages than the business (multiple replies per outbound), so the
    // raw inbound/outbound ratio can exceed 100% — which reads as a broken "rate". Cap it:
    // ">= as many replies as messages sent" is full (100%) engagement. The true reply
    // volume is still surfaced separately as the raw "Replies" count.
    const replyRateCur    = outboundCur > 0 ? Math.min(100, Math.round((inboundCur / outboundCur) * 100)) : 0;

    const deliveryRatePrev = outboundPrev > 0 ? Math.round(((deliveredPrev ?? 0) / outboundPrev) * 100) : 0;
    const readRatePrev     = outboundPrev > 0 ? Math.round(((readPrev ?? 0) / outboundPrev) * 100) : 0;
    const replyRatePrev    = outboundPrev > 0 ? Math.min(100, Math.round((inboundPrev / outboundPrev) * 100)) : 0;

    // ── 5. Leads — stage × temperature breakdown (range-scoped RPC; every row returned
    //      already falls within the window, so "total leads in range" is the row sum). ──
    const stageOrder = ['new', 'contacted', 'follow_up', 'interested', 'converted', 'lost'];
    function summarizeLeads(rows: LeadRow[]) {
      const stageMap: Record<string, number> = {};
      const tempMap: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
      let total = 0;
      for (const row of rows) {
        const cnt = Number(row.cnt);
        total += cnt;
        stageMap[row.stage] = (stageMap[row.stage] ?? 0) + cnt;
        if (row.temperature && row.temperature in tempMap) {
          tempMap[row.temperature] = (tempMap[row.temperature] ?? 0) + cnt;
        }
      }
      return { total, stageMap, tempMap, converted: stageMap['converted'] ?? 0 };
    }
    const leadsCur = summarizeLeads((leadCur ?? []) as LeadRow[]);
    const leadsPrev = summarizeLeads((leadPrev ?? []) as LeadRow[]);
    const conversionRateCur = leadsCur.total > 0 ? Math.round((leadsCur.converted / leadsCur.total) * 100) : 0;
    const conversionRatePrev = leadsPrev.total > 0 ? Math.round((leadsPrev.converted / leadsPrev.total) * 100) : 0;

    // ── 6. Conversations — status breakdown (current, ranged RPC) + total/resolved/
    //      avg-first-response (migration-067 RPC, both windows). "unresolved" = every
    //      conversation in range not yet marked resolved (total - resolved, exact from
    //      the same RPC's own columns). Deliberately NOT the platform's distinct
    //      "unanswered" concept (customer's latest message has no reply — see
    //      get_unanswered_conversations / the reply-sweep), which is a different metric
    //      this route doesn't compute. ─────────────────────────────────────────────────
    const convStatusMap: Record<string, number> = {};
    for (const row of (convStatusCur ?? []) as ConvStatusRow[]) {
      convStatusMap[row.status] = Number(row.cnt);
    }
    const convByStatus = Object.entries(convStatusMap).map(([status, count]) => ({ status, count }));

    const convMetricsCurRow = ((convMetricsCur ?? [])[0] ?? { total: 0, resolved: 0, avg_first_response_secs: null }) as ConvMetricsRow;
    const convMetricsPrevRow = ((convMetricsPrev ?? [])[0] ?? { total: 0, resolved: 0, avg_first_response_secs: null }) as ConvMetricsRow;

    const convTotalCur = Number(convMetricsCurRow.total);
    const convResolvedCur = Number(convMetricsCurRow.resolved);
    const convUnresolvedCur = Math.max(0, convTotalCur - convResolvedCur);
    const avgFirstResponseMins = convMetricsCurRow.avg_first_response_secs != null
      ? Math.round(Number(convMetricsCurRow.avg_first_response_secs) / 60)
      : null;

    const convTotalPrev = Number(convMetricsPrevRow.total);

    // ── 7. Campaigns — status totals + summed funnel counts (migration-067 RPC), current
    //      window only (no prev counterpart in the payload). ─────────────────────────────
    const campaignStatusMap: Record<string, number> = {};
    let campaignsTotal = 0, campaignsSent = 0, campaignsDelivered = 0, campaignsRead = 0, campaignsReplied = 0;
    for (const row of (campaignTotalsCur ?? []) as CampaignTotalsRow[]) {
      const campaigns = Number(row.campaigns);
      campaignStatusMap[row.status] = campaigns;
      campaignsTotal += campaigns;
      campaignsSent += Number(row.sent);
      campaignsDelivered += Number(row.delivered);
      campaignsRead += Number(row.read);
      campaignsReplied += Number(row.replied);
    }
    const topCampaigns = ((topCampaignsRaw ?? []) as Array<{ id: string; name: string; sent_count: number | null; replied_count: number | null }>)
      .map((c) => ({ id: c.id, name: c.name, sent: c.sent_count ?? 0, replied: c.replied_count ?? 0 }));

    // ── 8. Payload ───────────────────────────────────────────────────────────────────────
    return NextResponse.json({
      range: { from, to },
      kpis: {
        total_messages:       kpi(inboundCur + outboundCur, inboundPrev + outboundPrev),
        total_conversations:  kpi(convTotalCur, convTotalPrev),
        new_leads:             kpi(leadsCur.total, leadsPrev.total),
        new_contacts:          kpi(newContactsCur ?? 0, newContactsPrev ?? 0),
        delivery_rate:         kpi(deliveryRateCur, deliveryRatePrev),
        read_rate:             kpi(readRateCur, readRatePrev),
        reply_rate:            kpi(replyRateCur, replyRatePrev),
        conversion_rate:       kpi(conversionRateCur, conversionRatePrev),
      },
      messages: {
        sent: sentCur ?? 0,
        delivered: deliveredCur ?? 0,
        read: readCur ?? 0,
        failed: failedCur ?? 0,
        replies: inboundCur,
        daily: messagesDaily,
      },
      campaigns: {
        total: campaignsTotal,
        active: campaignStatusMap['running'] ?? 0,
        completed: campaignStatusMap['completed'] ?? 0,
        failed: campaignStatusMap['failed'] ?? 0,
        scheduled: campaignStatusMap['scheduled'] ?? 0,
        sent: campaignsSent,
        delivered: campaignsDelivered,
        read: campaignsRead,
        replied: campaignsReplied,
        top: topCampaigns,
      },
      leads: {
        total: leadsCur.total,
        hot: leadsCur.tempMap.hot ?? 0,
        warm: leadsCur.tempMap.warm ?? 0,
        cold: leadsCur.tempMap.cold ?? 0,
        converted: leadsCur.converted,
        by_stage: stageOrder.map((stage) => ({ stage, count: leadsCur.stageMap[stage] ?? 0 })),
      },
      conversations: {
        total: convTotalCur,
        open: convStatusMap['open'] ?? 0,
        resolved: convResolvedCur,
        unresolved: convUnresolvedCur,
        avg_first_response_mins: avgFirstResponseMins,
        by_status: convByStatus,
      },
      events,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Dashboard Overview]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

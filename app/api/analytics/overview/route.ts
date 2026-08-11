import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, type QuickRange } from '@/lib/date-range';
import { paginateAll } from '@/lib/export-stream';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // ── 0. Resolve the reporting date range — accepts ?quick=<preset> or
    //      ?quick=custom&from=&to=; defaults to last_30_days when unset. ────────
    const quick = (searchParams.get('quick') || 'last_30_days') as QuickRange;
    const { from, to, fromUtc, toUtc } = resolveRange(quick, {
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });

    // ── 1. Messages — daily/status/heatmap + conversation status via SQL
    //      aggregation RPCs (migration 064). Uncapped: aggregated server-side
    //      instead of the old bare `.select()` that silently truncated at 1000 rows. ─
    const [{ data: daily }, { data: statuses }, { data: heat }, { data: convStatus }] = await Promise.all([
      db.rpc('analytics_message_daily', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc }),
      db.rpc('analytics_message_status', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc }),
      db.rpc('analytics_message_heatmap', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc, p_tz: 'Asia/Kolkata' }),
      db.rpc('analytics_conversation_status', { p_workspace: workspaceId, p_from: fromUtc, p_to: toUtc }),
    ]);

    type DailyRow  = { day: string; direction: string; cnt: number | string };
    type StatusRow = { status: string; cnt: number | string };
    type HeatRow   = { dow: number | string; hour: number | string; cnt: number | string };

    const dailyRows = (daily ?? []) as DailyRow[];
    const totalInbound  = dailyRows.filter((r) => r.direction === 'inbound').reduce((a, r) => a + Number(r.cnt), 0);
    const totalOutbound = dailyRows.filter((r) => r.direction !== 'inbound').reduce((a, r) => a + Number(r.cnt), 0);

    // ── 2. Daily buckets — pre-fill every date in range, then fill inbound/outbound
    //      from the RPC (already grouped + uncapped) ─────────────────────────────
    const dailyMap: Record<string, { inbound: number; outbound: number; delivered: number; newContacts: number }> = {};
    for (let d = new Date(`${from}T00:00:00.000Z`).getTime(); d <= new Date(`${to}T00:00:00.000Z`).getTime(); d += 86_400_000) {
      dailyMap[new Date(d).toISOString().slice(0, 10)] = { inbound: 0, outbound: 0, delivered: 0, newContacts: 0 };
    }
    for (const row of dailyRows) {
      const key = row.day.slice(0, 10);
      if (!dailyMap[key]) dailyMap[key] = { inbound: 0, outbound: 0, delivered: 0, newContacts: 0 };
      const bucket = dailyMap[key]!;
      const cnt = Number(row.cnt);
      if (row.direction === 'inbound') bucket.inbound += cnt; else bucket.outbound += cnt;
    }
    // NOTE: per-day `delivered` isn't derivable from analytics_message_daily (it groups by
    // day+direction, not status) and no per-day status RPC exists. Left at 0 rather than
    // guessed — the dashboard chart doesn't read this field (only inbound/outbound/newContacts
    // are plotted); the accurate aggregate rate is reported via summary.deliveryRate below.

    // ── 3. Heatmap — 7×24, rows Mon..Sun (matches the previous JS `(getDay()+6)%7`
    //      convention the UI's HourlyHeatmap component expects) ────────────────────
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    for (const row of (heat ?? []) as HeatRow[]) {
      const uiDow = (Number(row.dow) + 6) % 7; // Postgres EXTRACT(DOW): 0=Sun..6=Sat → 0=Mon..6=Sun
      const hr = Number(row.hour);
      if (heatmap[uiDow] && hr >= 0 && hr < 24) {
        heatmap[uiDow]![hr] = (heatmap[uiDow]![hr] ?? 0) + Number(row.cnt);
      }
    }

    // ── 4. Delivery rate — from analytics_message_status (uncapped, exact counts) ──
    const byStatus = Object.fromEntries((statuses ?? []).map((r: StatusRow) => [r.status, Number(r.cnt)]));
    const delivered = (byStatus.delivered ?? 0) + (byStatus.read ?? 0); // read implies delivered
    const sentTotal = totalOutbound || 1;
    const deliveryRate = Math.round((delivered / sentTotal) * 100);

    // ── 5. Conversations — status breakdown is now range-scoped via the RPC
    //      (fixes the bug where this metric ignored the date filter entirely) ──────
    const convStatusMap: Record<string, number> = {};
    for (const row of (convStatus ?? []) as StatusRow[]) {
      convStatusMap[row.status] = Number(row.cnt);
    }
    const conversationsByStatus = Object.entries(convStatusMap).map(([status, count]) => ({ status, count }));

    // ── 6. Resolution time + first-response — needs row-level timestamps (no RPC
    //      covers this), so page ALL matching conversations in range (uncapped)
    //      instead of the old select with no date filter at all. ───────────────────
    const resBuckets: Record<string, number> = { '< 1 hr': 0, '1–4 hr': 0, '4–24 hr': 0, '> 24 hr': 0 };
    let respTotal = 0, respCount = 0;

    type ConvRow = { created_at: string; resolved_at: string | null; first_replied_at: string | null };
    for await (const page of paginateAll<ConvRow>((offset, pageSize) =>
      db.from('conversations')
        .select('created_at, resolved_at, first_replied_at')
        .eq('workspace_id', workspaceId)
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const c of page) {
        if (c.resolved_at && c.created_at) {
          const hrs = (new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime()) / 3_600_000;
          if (hrs < 1) resBuckets['< 1 hr']!++;
          else if (hrs < 4) resBuckets['1–4 hr']!++;
          else if (hrs < 24) resBuckets['4–24 hr']!++;
          else resBuckets['> 24 hr']!++;
        }
        if (c.first_replied_at && c.created_at) {
          const mins = (new Date(c.first_replied_at).getTime() - new Date(c.created_at).getTime()) / 60_000;
          if (mins > 0 && mins < 10_080) { respTotal += mins; respCount++; }
        }
      }
    }
    const resolutionTimeDistribution = Object.entries(resBuckets).map(([label, count]) => ({ label, count }));
    const avgResponseTimeMin = respCount > 0 ? Math.round(respTotal / respCount) : 0;

    // ── 7. Message sources + top contacts — one uncapped, ranged pass over
    //      `messages`. No aggregation RPC covers sender_type or per-sender ranking,
    //      so paginateAll is unavoidable here (both derived from a single scan,
    //      replacing what used to be two separate capped-at-1000 selects). ─────────
    const senderMap: Record<string, number> = {};
    const cmap: Record<string, { id: string; name: string | null; phone: string; count: number }> = {};

    type MsgRow = {
      sender_id: string;
      sender_type: string | null;
      direction: string;
      contacts: { id: string; name: string | null; phone: string } | null;
    };
    for await (const page of paginateAll<MsgRow>((offset, pageSize) =>
      db.from('messages')
        .select('sender_id, sender_type, direction, contacts!messages_sender_id_fkey(id, name, phone)')
        .eq('workspace_id', workspaceId)
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const row of page) {
        const t = row.sender_type ?? 'unknown';
        senderMap[t] = (senderMap[t] ?? 0) + 1;

        if (row.direction === 'inbound' && row.contacts) {
          const id = row.sender_id;
          if (!cmap[id]) cmap[id] = { id: row.contacts.id, name: row.contacts.name, phone: row.contacts.phone, count: 0 };
          cmap[id]!.count++;
        }
      }
    }
    const topContacts = Object.values(cmap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ id, name, phone, count }) => ({ id, name, phone, messageCount: count }));

    // ── 8. New contacts — exact count for the summary card ─────────────────────────
    const { count: newContacts } = await db.from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', fromUtc)
      .lt('created_at', toUtc);

    // Per-day breakdown for the "New Contacts" chart series — uncapped, ranged
    // (no aggregation RPC for this; paginateAll over the same filter is unavoidable).
    type ContactRow = { created_at: string };
    for await (const page of paginateAll<ContactRow>((offset, pageSize) =>
      db.from('contacts')
        .select('created_at')
        .eq('workspace_id', workspaceId)
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const c of page) {
        const key = c.created_at.slice(0, 10);
        if (dailyMap[key]) dailyMap[key]!.newContacts++;
      }
    }

    const dailyMessages = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    // ── 9. Tag distribution — snapshot metric, intentionally all-time (not
    //      range-filtered); paginated rather than a bare capped select so it stays
    //      correct past 1000 contacts. ───────────────────────────────────────────
    const tagMap: Record<string, number> = {};
    type TagRow = { tags: string[] | null };
    for await (const page of paginateAll<TagRow>((offset, pageSize) =>
      db.from('contacts')
        .select('tags')
        .eq('workspace_id', workspaceId)
        .range(offset, offset + pageSize - 1),
    )) {
      for (const row of page) {
        for (const tag of (row.tags ?? [])) {
          if (tag) tagMap[tag] = (tagMap[tag] ?? 0) + 1;
        }
      }
    }
    const tagDistribution = Object.entries(tagMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));

    // ── 10. Contact totals — snapshot metric, intentionally all-time ───────────────
    const { count: totalContacts } = await db
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    // ── 11. CSAT — ranged via fromUtc/toUtc (was the old `${from}T00:00:00.000Z` /
    //       `${to}T23:59:59.999Z` string pattern) ────────────────────────────────
    const { data: csatRaw } = await db
      .from('csat_responses')
      .select('score')
      .eq('workspace_id', workspaceId)
      .not('score', 'is', null)
      .gte('responded_at', fromUtc)
      .lt('responded_at', toUtc);

    const csatRows = (csatRaw ?? []) as Array<{ score: number }>;
    const csatResponseCount = csatRows.length;
    const csatAvgScore: number | null = csatResponseCount > 0
      ? Math.round((csatRows.reduce((s, r) => s + r.score, 0) / csatResponseCount) * 10) / 10
      : null;

    return NextResponse.json({
      summary: {
        totalMessages:       totalInbound + totalOutbound,
        totalInbound,
        totalOutbound,
        deliveryRate,
        avgResponseTimeMin,
        openConversations:   convStatusMap['open']     ?? 0,
        resolvedConversations: convStatusMap['resolved'] ?? 0,
        totalContacts:       totalContacts ?? 0,
        newContacts:         newContacts ?? 0,
        csatAvgScore,
        csatResponseCount,
      },
      dailyMessages,
      senderBreakdown: Object.entries(senderMap).map(([type, count]) => ({ type, count })),
      topContacts,
      conversationsByStatus,
      resolutionTimeDistribution,
      tagDistribution,
      hourlyHeatmap: heatmap,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Analytics Overview]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

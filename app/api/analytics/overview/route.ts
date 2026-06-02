import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

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

    // ── 1. All messages in range ─────────────────────────────────────────────
    const { data: msgRaw } = await db
      .from('messages')
      .select('created_at, direction, status, sender_type')
      .eq('workspace_id', workspaceId)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    const messages: Array<{ created_at: string; direction: string; status: string; sender_type: string }> = msgRaw ?? [];

    // ── 2. Daily buckets (pre-fill all dates) ────────────────────────────────
    const dailyMap: Record<string, { inbound: number; outbound: number; delivered: number; newContacts: number }> = {};
    for (let d = new Date(from).getTime(); d <= new Date(to).getTime(); d += 86_400_000) {
      dailyMap[new Date(d).toISOString().slice(0, 10)] = { inbound: 0, outbound: 0, delivered: 0, newContacts: 0 };
    }

    let totalInbound = 0, totalOutbound = 0, totalDelivered = 0;
    const senderMap: Record<string, number> = {};
    // Heatmap: day 0=Mon…6=Sun × hour 0-23
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);

    for (const msg of messages) {
      const key = msg.created_at.slice(0, 10);
      if (!dailyMap[key]) dailyMap[key] = { inbound: 0, outbound: 0, delivered: 0, newContacts: 0 };
      const day = dailyMap[key]!;

      if (msg.direction === 'inbound') {
        day.inbound++; totalInbound++;
        const dt  = new Date(msg.created_at);
        const dow = (dt.getDay() + 6) % 7;
        const hr  = dt.getHours();
        heatmap[dow]![hr] = (heatmap[dow]![hr] ?? 0) + 1;
      } else {
        day.outbound++; totalOutbound++;
        if (msg.status === 'delivered' || msg.status === 'read') { day.delivered++; totalDelivered++; }
      }

      const t = msg.sender_type ?? 'unknown';
      senderMap[t] = (senderMap[t] ?? 0) + 1;
    }

    // ── 3. New contacts per day ──────────────────────────────────────────────
    const { data: newContactsRaw } = await db
      .from('contacts')
      .select('created_at')
      .eq('workspace_id', workspaceId)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    for (const c of (newContactsRaw ?? []) as Array<{ created_at: string }>) {
      const key = c.created_at.slice(0, 10);
      if (dailyMap[key]) dailyMap[key]!.newContacts++;
    }

    const dailyMessages = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    // ── 4. Top contacts (up to 10) ───────────────────────────────────────────
    const { data: topRaw } = await db
      .from('messages')
      .select('sender_id, contacts!messages_sender_id_fkey(id, name, phone)')
      .eq('workspace_id', workspaceId)
      .eq('direction', 'inbound')
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    const cmap: Record<string, { id: string; name: string | null; phone: string; count: number }> = {};
    for (const row of (topRaw ?? []) as Array<{ sender_id: string; contacts: { id: string; name: string | null; phone: string } | null }>) {
      if (!row.contacts) continue;
      const id = row.sender_id;
      if (!cmap[id]) cmap[id] = { id: row.contacts.id, name: row.contacts.name, phone: row.contacts.phone, count: 0 };
      cmap[id]!.count++;
    }
    const topContacts = Object.values(cmap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ id, name, phone, count }) => ({ id, name, phone, messageCount: count }));

    // ── 5. Conversations — status + resolution time + avg response ───────────
    const { data: convoRaw } = await db
      .from('conversations')
      .select('status, created_at, resolved_at, first_replied_at')
      .eq('workspace_id', workspaceId);

    const statusMap: Record<string, number> = {};
    const resBuckets: Record<string, number> = { '< 1 hr': 0, '1–4 hr': 0, '4–24 hr': 0, '> 24 hr': 0 };
    let respTotal = 0, respCount = 0;

    for (const c of (convoRaw ?? []) as Array<{ status: string; created_at: string; resolved_at: string | null; first_replied_at: string | null }>) {
      statusMap[c.status] = (statusMap[c.status] ?? 0) + 1;

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

    const conversationsByStatus       = Object.entries(statusMap).map(([status, count]) => ({ status, count }));
    const resolutionTimeDistribution  = Object.entries(resBuckets).map(([label, count]) => ({ label, count }));
    const avgResponseTimeMin          = respCount > 0 ? Math.round(respTotal / respCount) : 0;

    // ── 6. Tag distribution ──────────────────────────────────────────────────
    const { data: tagRaw } = await db
      .from('contacts')
      .select('tags')
      .eq('workspace_id', workspaceId);

    const tagMap: Record<string, number> = {};
    for (const row of (tagRaw ?? []) as Array<{ tags: string[] | null }>) {
      for (const tag of (row.tags ?? [])) {
        if (tag) tagMap[tag] = (tagMap[tag] ?? 0) + 1;
      }
    }
    const tagDistribution = Object.entries(tagMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));

    // ── 7. Contact totals ────────────────────────────────────────────────────
    const { count: totalContacts } = await db
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    // ── 8. CSAT ──────────────────────────────────────────────────────────────
    const { data: csatRaw } = await db
      .from('csat_responses')
      .select('score')
      .eq('workspace_id', workspaceId)
      .not('score', 'is', null)
      .gte('responded_at', `${from}T00:00:00.000Z`)
      .lte('responded_at', `${to}T23:59:59.999Z`);

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
        deliveryRate:        totalOutbound > 0 ? Math.round((totalDelivered / totalOutbound) * 100) : 0,
        avgResponseTimeMin,
        openConversations:   statusMap['open']     ?? 0,
        resolvedConversations: statusMap['resolved'] ?? 0,
        totalContacts:       totalContacts ?? 0,
        newContacts:         (newContactsRaw ?? []).length,
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

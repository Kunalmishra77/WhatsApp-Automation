import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to date params required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const supabase = createAdminClient();

    // --- Daily messages ---
    const { data: dailyRaw, error: dailyErr } = await (supabase as any)
      .from('messages')
      .select('created_at, direction, status')
      .eq('workspace_id', workspaceId)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    if (dailyErr) {
      console.error('[Analytics] daily messages error', dailyErr);
    }

    const messages: Array<{ created_at: string; direction: string; status: string }> =
      dailyRaw ?? [];

    // Aggregate daily
    const dailyMap: Record<string, { inbound: number; outbound: number; delivered: number }> = {};
    // Pre-fill all dates in range
    const startMs = new Date(from).getTime();
    const endMs = new Date(to).getTime();
    for (let d = startMs; d <= endMs; d += 86400000) {
      const key = new Date(d).toISOString().slice(0, 10);
      dailyMap[key] = { inbound: 0, outbound: 0, delivered: 0 };
    }

    let totalInbound = 0;
    let totalOutbound = 0;
    let totalDelivered = 0;

    for (const msg of messages) {
      const key = msg.created_at.slice(0, 10);
      if (!dailyMap[key]) dailyMap[key] = { inbound: 0, outbound: 0, delivered: 0 };
      const day = dailyMap[key]!;

      if (msg.direction === 'inbound') {
        day.inbound += 1;
        totalInbound += 1;
      } else if (msg.direction === 'outbound') {
        day.outbound += 1;
        totalOutbound += 1;
        if (msg.status === 'delivered' || msg.status === 'read') {
          day.delivered += 1;
          totalDelivered += 1;
        }
      }
    }

    const dailyMessages = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    // --- Sender breakdown ---
    const { data: senderRaw } = await (supabase as any)
      .from('messages')
      .select('sender_type')
      .eq('workspace_id', workspaceId)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    const senderMap: Record<string, number> = {};
    for (const row of (senderRaw ?? []) as Array<{ sender_type: string }>) {
      const t = row.sender_type ?? 'unknown';
      senderMap[t] = (senderMap[t] ?? 0) + 1;
    }
    const senderBreakdown = Object.entries(senderMap).map(([type, count]) => ({ type, count }));

    // --- Top contacts ---
    const { data: topContactsRaw } = await (supabase as any)
      .from('messages')
      .select('sender_id, contacts!messages_sender_id_fkey(name, phone)')
      .eq('workspace_id', workspaceId)
      .eq('direction', 'inbound')
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    const contactMap: Record<string, { name: string | null; phone: string; count: number }> = {};
    for (const row of (topContactsRaw ?? []) as Array<{
      sender_id: string;
      contacts: { name: string | null; phone: string } | null;
    }>) {
      if (!row.contacts) continue;
      const id = row.sender_id;
      if (!contactMap[id]) {
        contactMap[id] = { name: row.contacts.name, phone: row.contacts.phone, count: 0 };
      }
      contactMap[id].count += 1;
    }
    const topContacts = Object.values(contactMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(({ name, phone, count }) => ({ name, phone, messageCount: count }));

    // --- Conversations by status ---
    const { data: convoStatusRaw } = await (supabase as any)
      .from('conversations')
      .select('status')
      .eq('workspace_id', workspaceId);

    const statusMap: Record<string, number> = {};
    for (const row of (convoStatusRaw ?? []) as Array<{ status: string }>) {
      const s = row.status ?? 'unknown';
      statusMap[s] = (statusMap[s] ?? 0) + 1;
    }
    const conversationsByStatus = Object.entries(statusMap).map(([status, count]) => ({
      status,
      count,
    }));

    // --- Summary counts ---
    const openConversations = statusMap['open'] ?? 0;
    const resolvedConversations = statusMap['resolved'] ?? 0;

    // Total contacts in workspace
    const { count: totalContacts } = await (supabase as any)
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    // New contacts in period
    const { count: newContacts } = await (supabase as any)
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    const totalMessages = totalInbound + totalOutbound;
    const deliveryRate =
      totalOutbound > 0 ? Math.round((totalDelivered / totalOutbound) * 100) : 0;

    // --- CSAT stats ---
    const { data: csatRaw } = await (supabase as any)
      .from('csat_responses')
      .select('score')
      .eq('workspace_id', workspaceId)
      .not('score', 'is', null)
      .gte('responded_at', `${from}T00:00:00.000Z`)
      .lte('responded_at', `${to}T23:59:59.999Z`);

    const csatRows = (csatRaw ?? []) as Array<{ score: number }>;
    const csatResponseCount = csatRows.length;
    const csatAvgScore: number | null =
      csatResponseCount > 0
        ? Math.round(
            (csatRows.reduce((sum, r) => sum + r.score, 0) / csatResponseCount) * 10,
          ) / 10
        : null;

    return NextResponse.json({
      summary: {
        totalMessages,
        totalInbound,
        totalOutbound,
        deliveryRate,
        avgResponseTimeMin: 0, // requires complex join — reserved for future
        openConversations,
        resolvedConversations,
        totalContacts: totalContacts ?? 0,
        newContacts: newContacts ?? 0,
        csatAvgScore,
        csatResponseCount,
      },
      dailyMessages,
      senderBreakdown,
      topContacts,
      conversationsByStatus,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Analytics Overview GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

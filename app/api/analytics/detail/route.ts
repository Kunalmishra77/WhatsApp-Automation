import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/analytics/detail?workspaceId=&type=open|resolved|new-contacts|csat|inbound|outbound|delivery&from=&to=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');
    const type        = searchParams.get('type');
    const from        = searchParams.get('from') ?? '';
    const to          = searchParams.get('to')   ?? '';

    if (!workspaceId || !type) {
      return NextResponse.json({ error: 'workspaceId and type required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'view_analytics');
    const db = createAdminClient() as any;

    // ── Conversations by status ─────────────────────────────────────────────
    if (type === 'open' || type === 'resolved' || type === 'pending' || type === 'assigned') {
      const { data } = await db
        .from('conversations')
        .select(`
          id, status, created_at, updated_at, resolved_at, unread_count, sla_first_breach, sla_resolve_breach,
          contacts(id, name, phone, tags),
          profiles!assigned_agent_id(full_name, email)
        `)
        .eq('workspace_id', workspaceId)
        .eq('status', type)
        .order('updated_at', { ascending: false })
        .limit(150);

      // For each conversation, fetch last message
      const convs = (data ?? []) as Array<Record<string, unknown>>;
      const ids   = convs.map((c) => c.id as string);

      let lastMsgMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: msgs } = await db
          .from('messages')
          .select('conversation_id, content, type, created_at')
          .in('conversation_id', ids)
          .eq('direction', 'inbound')
          .order('created_at', { ascending: false });

        for (const m of (msgs ?? []) as Array<{ conversation_id: string; content: string; type: string }>) {
          if (!lastMsgMap[m.conversation_id]) {
            lastMsgMap[m.conversation_id] = m.content || `[${m.type}]`;
          }
        }
      }

      return NextResponse.json({ rows: convs.map((c) => ({ ...c, lastMessage: lastMsgMap[c.id as string] ?? null })) });
    }

    // ── New contacts ────────────────────────────────────────────────────────
    if (type === 'new-contacts' || type === 'contacts') {
      const { data } = await db
        .from('contacts')
        .select('id, name, phone, email, tags, company, created_at, is_blocked, opted_out')
        .eq('workspace_id', workspaceId)
        .gte('created_at', from ? `${from}T00:00:00.000Z` : '1970-01-01T00:00:00.000Z')
        .lte('created_at', to   ? `${to}T23:59:59.999Z`  : new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(150);

      // Conversation count per contact
      const contactIds = ((data ?? []) as Array<{ id: string }>).map((c) => c.id);
      let convCountMap: Record<string, number> = {};
      if (contactIds.length > 0) {
        const { data: convs } = await db
          .from('conversations')
          .select('contact_id')
          .eq('workspace_id', workspaceId)
          .in('contact_id', contactIds);
        for (const c of (convs ?? []) as Array<{ contact_id: string }>) {
          convCountMap[c.contact_id] = (convCountMap[c.contact_id] ?? 0) + 1;
        }
      }

      return NextResponse.json({ rows: (data ?? []).map((c: any) => ({ ...c, conversationCount: convCountMap[c.id] ?? 0 })) });
    }

    // ── CSAT responses ──────────────────────────────────────────────────────
    if (type === 'csat') {
      const { data } = await db
        .from('csat_responses')
        .select(`
          id, score, comment, responded_at,
          contacts(name, phone),
          profiles!agent_id(full_name)
        `)
        .eq('workspace_id', workspaceId)
        .not('score', 'is', null)
        .gte('responded_at', from ? `${from}T00:00:00.000Z` : '1970-01-01')
        .lte('responded_at', to   ? `${to}T23:59:59.999Z`  : new Date().toISOString())
        .order('responded_at', { ascending: false })
        .limit(200);

      // Score distribution
      const rows  = (data ?? []) as Array<{ score: number }>;
      const dist  = [1,2,3,4,5].map((s) => ({ score: s, count: rows.filter((r) => r.score === s).length }));
      const avg   = rows.length > 0 ? Math.round((rows.reduce((a, r) => a + r.score, 0) / rows.length) * 10) / 10 : null;

      return NextResponse.json({ rows: data ?? [], scoreDist: dist, avg });
    }

    // ── Inbound messages ────────────────────────────────────────────────────
    if (type === 'inbound') {
      // Join through conversation to get contact (sender_id has no reliable FK to contacts)
      const { data } = await db
        .from('messages')
        .select(`
          id, content, type, status, created_at, sender_type, conversation_id,
          conversations!messages_conversation_id_fkey(
            contact_id,
            contacts(name, phone)
          )
        `)
        .eq('workspace_id', workspaceId)
        .eq('direction', 'inbound')
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: false })
        .limit(200);

      return NextResponse.json({ rows: data ?? [] });
    }

    // ── Outbound messages ───────────────────────────────────────────────────
    if (type === 'outbound') {
      const { data } = await db
        .from('messages')
        .select(`
          id, content, type, status, created_at, sender_type, conversation_id,
          conversations!messages_conversation_id_fkey(
            contact_id,
            contacts(name, phone)
          )
        `)
        .eq('workspace_id', workspaceId)
        .eq('direction', 'outbound')
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: false })
        .limit(200);

      return NextResponse.json({ rows: data ?? [] });
    }

    // ── Delivery breakdown ──────────────────────────────────────────────────
    if (type === 'delivery') {
      const { data } = await db
        .from('messages')
        .select('status, delivered_at, read_at, created_at')
        .eq('workspace_id', workspaceId)
        .eq('direction', 'outbound')
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`);

      const buckets: Record<string, number> = { sent: 0, delivered: 0, read: 0, failed: 0, queued: 0 };
      for (const r of (data ?? []) as Array<{ status: string }>) {
        const s = r.status ?? 'queued';
        if (s in buckets) (buckets as any)[s]++;
      }
      return NextResponse.json({ buckets, rows: data ?? [] });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Analytics Detail]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

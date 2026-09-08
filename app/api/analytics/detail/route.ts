import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange } from '@/lib/date-range';

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

    // IST-correct, half-open range shared by every branch below (was previously a mix
    // of naive UTC-midnight strings per branch, which is wrong for any non-UTC
    // workspace timezone — see the open/resolved branch this was lifted from).
    const { fromUtc, toUtc } = resolveRange('custom', { from, to });

    // ── Conversations by status ─────────────────────────────────────────────
    if (type === 'open' || type === 'resolved' || type === 'pending' || type === 'assigned') {
      // Bounded "recent N for display" list (drawer table, not an aggregate) —
      // .limit(150) intentionally kept; no count/total is derived from these rows.
      const { data } = await db
        .from('conversations')
        .select(`
          id, status, created_at, updated_at, resolved_at, unread_count, sla_first_breach, sla_resolve_breach,
          contacts(id, name, phone, tags),
          profiles!assigned_agent_id(full_name, email)
        `)
        .eq('workspace_id', workspaceId)
        .eq('status', type)
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
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
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
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
      // Display list: most-recent 200 (with contact/agent joins).
      const { data } = await db
        .from('csat_responses')
        .select(`
          id, score, comment, responded_at,
          contacts(name, phone),
          profiles!agent_id(full_name)
        `)
        .eq('workspace_id', workspaceId)
        .not('score', 'is', null)
        .gte('responded_at', fromUtc)
        .lt('responded_at', toUtc)
        .order('responded_at', { ascending: false })
        .limit(200);

      // avg + distribution over ALL responses in range (paginated) — deriving them from
      // the capped 200-row display list would understate both for busy workspaces.
      const scores: number[] = [];
      let cOff = 0;
      while (true) {
        const { data: pg } = await db
          .from('csat_responses')
          .select('score')
          .eq('workspace_id', workspaceId)
          .not('score', 'is', null)
          .gte('responded_at', fromUtc)
          .lt('responded_at', toUtc)
          .range(cOff, cOff + 999);
        if (!pg?.length) break;
        for (const r of pg as Array<{ score: number }>) scores.push(r.score);
        if (pg.length < 1000) break;
        cOff += 1000;
      }
      const dist = [1, 2, 3, 4, 5].map((s) => ({ score: s, count: scores.filter((x) => x === s).length }));
      const avg  = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

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
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
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
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
        .order('created_at', { ascending: false })
        .limit(200);

      return NextResponse.json({ rows: data ?? [] });
    }

    // ── Delivery breakdown ──────────────────────────────────────────────────
    if (type === 'delivery') {
      // Buckets via exact per-status counts (accurate for any volume). Deriving them from
      // a bare .select() would silently cap at PostgREST's 1000-row default.
      const countFor = (status: string) =>
        db.from('messages').select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId).eq('direction', 'outbound')
          .gte('created_at', fromUtc).lt('created_at', toUtc)
          .eq('status', status);
      const [sent, delivered, read, failed, queued] = await Promise.all([
        countFor('sent'), countFor('delivered'), countFor('read'), countFor('failed'), countFor('queued'),
      ]);
      const buckets = {
        sent: sent.count ?? 0, delivered: delivered.count ?? 0, read: read.count ?? 0,
        failed: failed.count ?? 0, queued: queued.count ?? 0,
      };

      // A capped sample of rows for the drill-down list (the headline numbers are `buckets`).
      const { data } = await db
        .from('messages')
        .select('status, delivered_at, read_at, created_at')
        .eq('workspace_id', workspaceId)
        .eq('direction', 'outbound')
        .gte('created_at', fromUtc)
        .lt('created_at', toUtc)
        .order('created_at', { ascending: false })
        .limit(500);

      return NextResponse.json({ buckets, rows: data ?? [] });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Analytics Detail]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

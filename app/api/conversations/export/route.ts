import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import * as XLSX from 'xlsx';

function toIST(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

// GET /api/conversations/export?workspaceId=&from=YYYY-MM-DD&to=YYYY-MM-DD&status=&channel=
// Sheet 1 "Summary"      — one row per conversation
// Sheet 2 "Full History" — all messages across every matched conversation
export async function GET(request: NextRequest) {
  try {
    const sp          = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    const from        = sp.get('from');
    const to          = sp.get('to');
    const status      = sp.get('status') ?? '';
    const channel     = sp.get('channel') ?? '';

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const ctx = await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db  = createAdminClient() as any;

    // ── Fetch conversations ────────────────────────────────────────────────────
    let q = db
      .from('conversations')
      .select(`
        id, status, channel, last_message, last_message_at, created_at, labels, bot_paused,
        contacts(name, phone),
        profiles:assigned_agent_id(full_name, email)
      `)
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false })
      .limit(5000);

    if (ctx.role === 'agent') q = q.eq('assigned_agent_id', ctx.userId);
    if (status)  q = q.eq('status', status);
    if (channel) q = q.eq('channel', channel);
    if (from)    q = q.gte('last_message_at', `${from}T00:00:00.000Z`);
    if (to)      q = q.lte('last_message_at', `${to}T23:59:59.999Z`);

    const { data: conversations, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const convList = (conversations ?? []) as Array<{
      id: string;
      status: string;
      channel: string;
      last_message: string | null;
      last_message_at: string | null;
      created_at: string | null;
      labels: string[] | null;
      bot_paused: boolean;
      contacts: { name?: string; phone?: string } | null;
      profiles: { full_name?: string; email?: string } | null;
    }>;

    // ── Sheet 1: Summary ──────────────────────────────────────────────────────
    const summaryRows = convList.map((c) => ({
      'Contact Name':    c.contacts?.name  ?? '',
      'Phone':           c.contacts?.phone ?? '',
      'Status':          c.status          ?? '',
      'Channel':         c.channel         ?? '',
      'Last Message':    c.last_message    ?? '',
      'Last Message At': toIST(c.last_message_at),
      'Assigned Agent':  c.profiles?.full_name ?? c.profiles?.email ?? 'Unassigned',
      'Labels':          Array.isArray(c.labels) ? c.labels.join(', ') : '',
      'Bot Paused':      c.bot_paused ? 'Yes' : 'No',
      'Created At':      toIST(c.created_at),
    }));

    // ── Fetch all messages for matched conversations ───────────────────────────
    const convIds = convList.map((c) => c.id);
    const historyRows: Array<Record<string, string>> = [];

    if (convIds.length > 0) {
      // Build a quick lookup: conv id → contact info + agent name
      const convMeta = new Map(convList.map((c) => [c.id, {
        contactName: c.contacts?.name  ?? '',
        phone:       c.contacts?.phone ?? '',
        agent:       c.profiles?.full_name ?? c.profiles?.email ?? 'Unassigned',
        status:      c.status,
        channel:     c.channel,
      }]));

      // Fetch messages in batches of 200 conversation IDs
      const MSG_BATCH = 200;
      for (let ci = 0; ci < convIds.length; ci += MSG_BATCH) {
        const batchIds = convIds.slice(ci, ci + MSG_BATCH);
        const { data: msgs } = await db
          .from('messages')
          .select('conversation_id, direction, content, message_type, created_at, status')
          .in('conversation_id', batchIds)
          .order('created_at', { ascending: true })
          .limit(50000);

        if (msgs) {
          for (const m of msgs as Array<{
            conversation_id: string;
            direction: string;
            content: string | null;
            message_type: string | null;
            created_at: string | null;
            status: string | null;
          }>) {
            const meta = convMeta.get(m.conversation_id);
            historyRows.push({
              'Contact Name':    meta?.contactName ?? '',
              'Phone':           meta?.phone       ?? '',
              'Channel':         meta?.channel     ?? '',
              'Assigned Agent':  meta?.agent       ?? 'Unassigned',
              'Direction':       m.direction       ?? '',
              'Sender':          m.direction === 'inbound' ? (meta?.contactName ?? meta?.phone ?? '') : 'Agent / Bot',
              'Message':         m.content         ?? '',
              'Type':            m.message_type    ?? 'text',
              'Status':          m.status          ?? '',
              'Timestamp (IST)': toIST(m.created_at),
            });
          }
        }
      }
    }

    // ── Build Excel workbook ───────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows.length ? summaryRows : [{}]);
    wsSummary['!cols'] = [
      { wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 12 },
      { wch: 50 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const wsHistory = XLSX.utils.json_to_sheet(historyRows.length ? historyRows : [{}]);
    wsHistory['!cols'] = [
      { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 20 },
      { wch: 10 }, { wch: 22 }, { wch: 60 }, { wch: 12 }, { wch: 10 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, wsHistory, 'Full History');

    const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const dateTag  = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);
    const filename = `conversations_${dateTag}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Conversations Export]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

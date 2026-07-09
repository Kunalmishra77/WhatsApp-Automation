import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import * as XLSX from 'xlsx';

function toIST(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function cutoffDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

// GET /api/workspace/retention?workspaceId=&months=2
// Returns stats: how many conversations/messages/contacts are older than `months`.
export async function GET(request: NextRequest) {
  try {
    const sp          = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    const months      = Math.max(1, parseInt(sp.get('months') ?? '2', 10));

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'billing_management');

    const db     = createAdminClient() as any;
    const cutoff = cutoffDate(months);

    const [{ count: convCount }, { count: msgCount }] = await Promise.all([
      db.from('conversations').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .lt('last_message_at', cutoff),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .lt('created_at', cutoff),
    ]);

    return NextResponse.json({
      cutoff,
      months,
      conversations: convCount ?? 0,
      messages:      msgCount  ?? 0,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Retention Stats]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/workspace/retention  body: { workspaceId, months, action: 'export' | 'delete' }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, months: rawMonths, action } = await request.json() as {
      workspaceId?: string;
      months?: number;
      action?: 'export' | 'delete';
    };

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    if (action !== 'export' && action !== 'delete') {
      return NextResponse.json({ error: 'action must be export or delete' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'billing_management');

    const db     = createAdminClient() as any;
    const months = Math.max(1, rawMonths ?? 2);
    const cutoff = cutoffDate(months);

    // Fetch old conversations (max 10 000 for export safety)
    const { data: oldConvs, error: convErr } = await db
      .from('conversations')
      .select('id, status, channel, last_message, last_message_at, created_at, contacts(name, phone)')
      .eq('workspace_id', workspaceId)
      .lt('last_message_at', cutoff)
      .order('last_message_at', { ascending: true })
      .limit(10000);

    if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
    const convList = (oldConvs ?? []) as Array<{
      id: string; status: string; channel: string;
      last_message: string | null; last_message_at: string | null; created_at: string | null;
      contacts: { name?: string; phone?: string } | null;
    }>;

    // ── EXPORT ────────────────────────────────────────────────────────────────
    if (action === 'export') {
      const convIds = convList.map((c) => c.id);
      const historyRows: Array<Record<string, string>> = [];

      const convMeta = new Map(convList.map((c) => [c.id, {
        contactName: c.contacts?.name  ?? '',
        phone:       c.contacts?.phone ?? '',
        channel:     c.channel,
      }]));

      if (convIds.length > 0) {
        const MSG_BATCH = 200;
        for (let ci = 0; ci < convIds.length; ci += MSG_BATCH) {
          const batchIds = convIds.slice(ci, ci + MSG_BATCH);
          const { data: msgs } = await db
            .from('messages')
            .select('conversation_id, direction, content, message_type, created_at')
            .in('conversation_id', batchIds)
            .order('created_at', { ascending: true })
            .limit(100000);

          if (msgs) {
            for (const m of msgs as Array<{
              conversation_id: string; direction: string;
              content: string | null; message_type: string | null; created_at: string | null;
            }>) {
              const meta = convMeta.get(m.conversation_id);
              historyRows.push({
                'Contact Name':    meta?.contactName ?? '',
                'Phone':           meta?.phone       ?? '',
                'Channel':         meta?.channel     ?? '',
                'Direction':       m.direction       ?? '',
                'Sender':          m.direction === 'inbound' ? (meta?.contactName ?? meta?.phone ?? '') : 'Agent / Bot',
                'Message':         m.content         ?? '',
                'Type':            m.message_type    ?? 'text',
                'Timestamp (IST)': toIST(m.created_at),
              });
            }
          }
        }
      }

      const summaryRows = convList.map((c) => ({
        'Contact Name':    c.contacts?.name  ?? '',
        'Phone':           c.contacts?.phone ?? '',
        'Status':          c.status,
        'Channel':         c.channel,
        'Last Message':    c.last_message    ?? '',
        'Last Message At': toIST(c.last_message_at),
        'Created At':      toIST(c.created_at),
      }));

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows.length ? summaryRows : [{}]);
      wsSummary['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 40 }, { wch: 22 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Conversations');

      const wsHistory = XLSX.utils.json_to_sheet(historyRows.length ? historyRows : [{}]);
      wsHistory['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 60 }, { wch: 12 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsHistory, 'Full History');

      const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `archive_before_${cutoff.slice(0, 10)}.xlsx`;
      return new NextResponse(buf, {
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // ── DELETE ─────────────────────────────────────────────────────────────────
    if (convList.length === 0) {
      return NextResponse.json({ deleted: { conversations: 0, messages: 0 } });
    }

    const convIds = convList.map((c) => c.id);

    // Delete messages first (FK → conversations)
    const BATCH = 500;
    let deletedMsgs = 0;
    for (let ci = 0; ci < convIds.length; ci += BATCH) {
      const batchIds = convIds.slice(ci, ci + BATCH);
      const { count } = await db
        .from('messages')
        .delete({ count: 'exact' })
        .in('conversation_id', batchIds);
      deletedMsgs += count ?? 0;
    }

    // Delete conversations
    let deletedConvs = 0;
    for (let ci = 0; ci < convIds.length; ci += BATCH) {
      const batchIds = convIds.slice(ci, ci + BATCH);
      const { count } = await db
        .from('conversations')
        .delete({ count: 'exact' })
        .in('id', batchIds);
      deletedConvs += count ?? 0;
    }

    return NextResponse.json({ deleted: { conversations: deletedConvs, messages: deletedMsgs } });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Retention Action]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

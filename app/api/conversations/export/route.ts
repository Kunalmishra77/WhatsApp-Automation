import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import * as XLSX from 'xlsx';

// GET /api/conversations/export?workspaceId=&from=YYYY-MM-DD&to=YYYY-MM-DD&status=&channel=
// Downloads all conversations matching the filters as an Excel file.
export async function GET(request: NextRequest) {
  try {
    const sp          = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    const from        = sp.get('from');   // e.g. 2026-07-01
    const to          = sp.get('to');     // e.g. 2026-07-09
    const status      = sp.get('status') ?? '';   // open | pending | resolved | ''
    const channel     = sp.get('channel') ?? '';  // whatsapp | instagram | ''

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const ctx = await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    let q = db
      .from('conversations')
      .select(`
        id, status, channel, last_message, last_message_at, created_at, labels, bot_paused,
        contacts(name, phone),
        profiles:assigned_agent_id(full_name)
      `)
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false });

    // Agents only see their own assigned conversations
    if (ctx.role === 'agent') q = q.eq('assigned_agent_id', ctx.userId);

    if (status)  q = q.eq('status', status);
    if (channel) q = q.eq('channel', channel);

    // Date range filter on last_message_at
    if (from) q = q.gte('last_message_at', `${from}T00:00:00.000Z`);
    if (to)   q = q.lte('last_message_at', `${to}T23:59:59.999Z`);

    const { data: conversations, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Build Excel rows
    const rows = (conversations ?? []).map((c: any) => {
      const contact      = c.contacts as { name?: string; phone?: string } | null;
      const agent        = c.profiles as { full_name?: string } | null;
      const lastMsgAt    = c.last_message_at
        ? new Date(c.last_message_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : '';
      const createdAt    = c.created_at
        ? new Date(c.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : '';
      const labels       = Array.isArray(c.labels) ? (c.labels as string[]).join(', ') : '';

      return {
        'Contact Name':    contact?.name  ?? '',
        'Phone':           contact?.phone ?? '',
        'Status':          c.status       ?? '',
        'Channel':         c.channel      ?? '',
        'Last Message':    c.last_message ?? '',
        'Last Message At': lastMsgAt,
        'Assigned Agent':  agent?.full_name ?? 'Unassigned',
        'Labels':          labels,
        'Bot Paused':      c.bot_paused ? 'Yes' : 'No',
        'Created At':      createdAt,
      };
    });

    // Generate Excel
    const wb  = XLSX.utils.book_new();
    const ws  = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);

    // Style header row (column widths)
    ws['!cols'] = [
      { wch: 22 }, // Contact Name
      { wch: 16 }, // Phone
      { wch: 10 }, // Status
      { wch: 12 }, // Channel
      { wch: 50 }, // Last Message
      { wch: 22 }, // Last Message At
      { wch: 20 }, // Assigned Agent
      { wch: 20 }, // Labels
      { wch: 10 }, // Bot Paused
      { wch: 22 }, // Created At
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Conversations');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const dateTag = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);
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

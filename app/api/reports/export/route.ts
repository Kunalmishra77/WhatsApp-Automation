import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// ── CSV helper ──────────────────────────────────────────────────────────────
function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(escape), ...rows.map((r) => r.map(escape))].join('\n');
}

// ── GET /api/reports/export ──────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');
    const type = searchParams.get('type');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }
    if (!type || !['conversations', 'messages', 'contacts'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be one of: conversations, messages, contacts' },
        { status: 400 },
      );
    }
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to date params required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const supabase = createAdminClient();
    let csvContent = '';

    // ── conversations ──────────────────────────────────────────────────────
    if (type === 'conversations') {
      const { data, error } = await (supabase as any)
        .from('conversations')
        .select(
          'id, status, channel, sentiment, last_message, last_message_at, created_at, resolved_at, labels, contacts(name, phone, temperature), assigned_agent:workspace_members!conversations_assigned_agent_id_fkey(user_id)',
        )
        .eq('workspace_id', workspaceId)
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Export] conversations error', error);
        return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
      }

      const rows: string[][] = ((data ?? []) as Array<{
        id: string;
        status: string | null;
        channel: string | null;
        sentiment: string | null;
        last_message: string | null;
        last_message_at: string | null;
        created_at: string | null;
        resolved_at: string | null;
        labels: string[] | null;
        contacts: { name: string | null; phone: string; temperature?: string | null } | null;
        assigned_agent: { user_id: string } | null;
      }>).map((row) => [
        row.id ?? '',
        row.contacts?.name ?? '',
        row.contacts?.phone ?? '',
        row.status ?? '',
        row.channel ?? '',
        row.contacts?.temperature ?? 'warm',       // hot / warm / cold
        row.sentiment ?? '',                        // positive / neutral / negative
        Array.isArray(row.labels) ? row.labels.join(', ') : '',
        row.last_message?.slice(0, 120) ?? '',
        row.last_message_at ?? '',
        row.assigned_agent?.user_id ?? '',
        row.created_at ?? '',
        row.resolved_at ?? '',
      ]);

      csvContent = toCSV(
        [
          'ID',
          'Contact Name',
          'Contact Phone',
          'Status',
          'Channel',
          'Lead Temperature',
          'Sentiment',
          'Labels',
          'Last Message',
          'Last Message At',
          'Assigned Agent',
          'Created At',
          'Resolved At',
        ],
        rows,
      );
    }

    // ── messages ───────────────────────────────────────────────────────────
    else if (type === 'messages') {
      const { data, error } = await (supabase as any)
        .from('messages')
        .select('id, conversation_id, direction, type, content, sender_type, status, created_at')
        .eq('workspace_id', workspaceId)
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Export] messages error', error);
        return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
      }

      const rows: string[][] = ((data ?? []) as Array<{
        id: string;
        conversation_id: string | null;
        direction: string | null;
        type: string | null;
        content: string | null;
        sender_type: string | null;
        status: string | null;
        created_at: string | null;
      }>).map((row) => [
        row.id ?? '',
        row.conversation_id ?? '',
        row.direction ?? '',
        row.type ?? '',
        row.content ?? '',
        row.sender_type ?? '',
        row.status ?? '',
        row.created_at ?? '',
      ]);

      csvContent = toCSV(
        ['ID', 'Conversation ID', 'Direction', 'Type', 'Content', 'Sender Type', 'Status', 'Created At'],
        rows,
      );
    }

    // ── contacts ───────────────────────────────────────────────────────────
    else {
      const { data, error } = await (supabase as any)
        .from('contacts')
        .select('id, name, phone, email, company, country, tags, temperature, language, opted_out, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Export] contacts error', error);
        return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
      }

      const rows: string[][] = ((data ?? []) as Array<{
        id: string;
        name: string | null;
        phone: string | null;
        email: string | null;
        company: string | null;
        country: string | null;
        tags: string[] | null;
        temperature: string | null;
        language: string | null;
        opted_out: boolean | null;
        created_at: string | null;
      }>).map((row) => [
        row.id ?? '',
        row.name ?? '',
        row.phone ?? '',
        row.email ?? '',
        row.company ?? '',
        row.country ?? '',
        Array.isArray(row.tags) ? row.tags.join(', ') : (row.tags ?? ''),
        row.temperature ?? 'warm',
        row.language ?? '',
        row.opted_out ? 'Yes' : 'No',
        row.created_at ?? '',
      ]);

      csvContent = toCSV(
        ['ID', 'Name', 'Phone', 'Email', 'Company', 'Country', 'Tags', 'Lead Temperature', 'Language', 'Opted Out', 'Created At'],
        rows,
      );
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}-${from}-${to}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Export GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

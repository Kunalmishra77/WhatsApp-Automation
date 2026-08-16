import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { paginateAll } from '@/lib/export-stream';
import { LEAD_EXPORT_HEADERS, leadToRow, type LeadRecord } from '@/lib/lead-export';

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
    if (!type || !['conversations', 'messages', 'contacts', 'campaigns', 'leads'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be one of: conversations, messages, contacts, campaigns, leads' },
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
      const SELECT =
        'id, status, channel, sentiment, last_message, last_message_at, created_at, resolved_at, labels, contacts(name, phone, temperature), assigned_agent:workspace_members!conversations_assigned_agent_id_fkey(user_id)';
      const data: any[] = [];
      try {
        for await (const page of paginateAll<any>((offset, pageSize) =>
          (supabase as any)
            .from('conversations')
            .select(SELECT)
            .eq('workspace_id', workspaceId)
            .gte('created_at', `${from}T00:00:00.000Z`)
            .lte('created_at', `${to}T23:59:59.999Z`)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1),
        )) {
          data.push(...page);
        }
      } catch (error) {
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
      const SELECT = 'id, conversation_id, direction, type, content, sender_type, status, created_at';
      const data: any[] = [];
      try {
        for await (const page of paginateAll<any>((offset, pageSize) =>
          (supabase as any)
            .from('messages')
            .select(SELECT)
            .eq('workspace_id', workspaceId)
            .gte('created_at', `${from}T00:00:00.000Z`)
            .lte('created_at', `${to}T23:59:59.999Z`)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1),
        )) {
          data.push(...page);
        }
      } catch (error) {
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
    else if (type === 'contacts') {
      const SELECT = 'id, name, phone, email, company, country, tags, temperature, language, opted_out, created_at';
      const data: any[] = [];
      try {
        for await (const page of paginateAll<any>((offset, pageSize) =>
          (supabase as any)
            .from('contacts')
            .select(SELECT)
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1),
        )) {
          data.push(...page);
        }
      } catch (error) {
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

    // ── campaigns ──────────────────────────────────────────────────────────
    else if (type === 'campaigns') {
      const SELECT = 'id, name, status, sent_count, delivered_count, read_count, replied_count, failed_count, created_at';
      const data: any[] = [];
      try {
        for await (const page of paginateAll<any>((offset, pageSize) =>
          (supabase as any)
            .from('campaigns')
            .select(SELECT)
            .eq('workspace_id', workspaceId)
            .gte('created_at', `${from}T00:00:00.000Z`)
            .lte('created_at', `${to}T23:59:59.999Z`)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1),
        )) {
          data.push(...page);
        }
      } catch (error) {
        console.error('[Export] campaigns error', error);
        return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
      }

      const rows: string[][] = ((data ?? []) as Array<{
        id: string;
        name: string | null;
        status: string | null;
        sent_count: number | null;
        delivered_count: number | null;
        read_count: number | null;
        replied_count: number | null;
        failed_count: number | null;
        created_at: string | null;
      }>).map((row) => [
        row.id ?? '',
        row.name ?? '',
        row.status ?? '',
        String(row.sent_count ?? 0),
        String(row.delivered_count ?? 0),
        String(row.read_count ?? 0),
        String(row.replied_count ?? 0),
        String(row.failed_count ?? 0),
        row.created_at ?? '',
      ]);

      csvContent = toCSV(
        ['ID', 'Name', 'Status', 'Sent', 'Delivered', 'Read', 'Replied', 'Failed', 'Created At'],
        rows,
      );
    }

    // ── leads ──────────────────────────────────────────────────────────────
    // Reuses lib/lead-export.ts's headers/row-mapper so this stays in sync with
    // /api/leads/export's column set (incl. AI Score) rather than re-forking it.
    else {
      const SELECT = `
        temperature, stage, priority, source, value, currency, tags, follow_up_at, created_at, ai_score,
        contacts(name, phone),
        profiles:assigned_agent_id(full_name, email),
        conversations(last_message_at)
      `;
      const data: LeadRecord[] = [];
      try {
        for await (const page of paginateAll<LeadRecord>((offset, pageSize) =>
          (supabase as any)
            .from('leads')
            .select(SELECT)
            .eq('workspace_id', workspaceId)
            .gte('created_at', `${from}T00:00:00.000Z`)
            .lte('created_at', `${to}T23:59:59.999Z`)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1),
        )) {
          data.push(...page);
        }
      } catch (error) {
        console.error('[Export] leads error', error);
        return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
      }

      csvContent = toCSV([...LEAD_EXPORT_HEADERS], data.map((lead) => leadToRow(lead)));
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

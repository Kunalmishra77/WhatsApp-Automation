import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { paginateAll, exportResponse, streamingCsvResponse } from '@/lib/export-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function toIST(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

interface ConvRow {
  id: string;
  status: string | null;
  channel: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string | null;
  labels: string[] | null;
  bot_paused: boolean | null;
  contacts: { name?: string | null; phone?: string | null } | null;
  profiles: { full_name?: string | null; email?: string | null } | null;
}
interface MsgRow {
  conversation_id: string;
  direction: string | null;
  content: string | null;
  message_type: string | null;
  created_at: string | null;
  status: string | null;
}

const SUMMARY_HEADERS = [
  'Contact Name', 'Phone', 'Status', 'Channel', 'Last Message', 'Last Message At',
  'Assigned Agent', 'Labels', 'Bot Paused', 'Created At',
];
const HISTORY_HEADERS = [
  'Contact Name', 'Phone', 'Channel', 'Assigned Agent', 'Direction', 'Sender',
  'Message', 'Type', 'Status', 'Timestamp (IST)',
];

// GET /api/conversations/export?workspaceId=&view=summary|history&from=&to=&status=&channel=&format=csv
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const ctx = await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const view = sp.get('view') === 'history' ? 'history' : 'summary';
    const from = sp.get('from');
    const to = sp.get('to');
    const status = sp.get('status') ?? '';
    const channel = sp.get('channel') ?? '';
    const forceCsv = sp.get('format') === 'csv';
    const dateTag = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);

    const applyConvFilters = (q: any) => {
      q = q.eq('workspace_id', workspaceId);
      if (ctx.role === 'agent') q = q.eq('assigned_agent_id', ctx.userId);
      if (status) q = q.eq('status', status);
      if (channel) q = q.eq('channel', channel);
      if (from) q = q.gte('last_message_at', `${from}T00:00:00.000Z`);
      if (to) q = q.lte('last_message_at', `${to}T23:59:59.999Z`);
      return q;
    };

    // ── SUMMARY: one row per conversation, hybrid xlsx/csv ──────────────────────
    if (view === 'summary') {
      const { count, error: countErr } = await applyConvFilters(
        db.from('conversations').select('*', { count: 'exact', head: true }),
      );
      if (countErr) {
        console.error('[ConvExport count]', countErr);
        return NextResponse.json({ error: 'Failed to count conversations' }, { status: 500 });
      }
      const pages = paginateAll<ConvRow>((offset, pageSize) =>
        applyConvFilters(db.from('conversations').select(`
          id, status, channel, last_message, last_message_at, created_at, labels, bot_paused,
          contacts(name, phone), profiles:assigned_agent_id(full_name, email)
        `))
          .order('last_message_at', { ascending: false })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1),
      );
      return await exportResponse<ConvRow>({
        count: count ?? 0,
        forceCsv,
        headers: SUMMARY_HEADERS,
        pages,
        mapRow: (c) => [
          c.contacts?.name ?? '', c.contacts?.phone ?? '', c.status ?? '', c.channel ?? '',
          c.last_message ?? '', toIST(c.last_message_at),
          c.profiles?.full_name ?? c.profiles?.email ?? 'Unassigned',
          Array.isArray(c.labels) ? c.labels.join(', ') : '', c.bot_paused ? 'Yes' : 'No',
          toIST(c.created_at),
        ],
        filenameBase: `conversations_summary_${dateTag}`,
        sheetName: 'Summary',
      });
    }

    // ── HISTORY: one row per message, always streaming CSV ──────────────────────
    // Phase 1: page all matching conversation IDs (uncapped) + build a meta lookup.
    const meta = new Map<string, { name: string; phone: string; agent: string; channel: string }>();
    for await (const page of paginateAll<ConvRow>((offset, pageSize) =>
      applyConvFilters(db.from('conversations').select(`
        id, channel, contacts(name, phone), profiles:assigned_agent_id(full_name, email)
      `))
        .order('last_message_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      for (const c of page) {
        meta.set(c.id, {
          name: c.contacts?.name ?? '',
          phone: c.contacts?.phone ?? '',
          agent: c.profiles?.full_name ?? c.profiles?.email ?? 'Unassigned',
          channel: c.channel ?? '',
        });
      }
    }
    const convIds = [...meta.keys()];

    // Phase 2: stream messages for those conversations, batched by 200 ids.
    async function* historyPages(): AsyncGenerator<MsgRow[]> {
      const BATCH = 200;
      for (let i = 0; i < convIds.length; i += BATCH) {
        const batch = convIds.slice(i, i + BATCH);
        yield* paginateAll<MsgRow>((offset, pageSize) =>
          db.from('messages')
            .select('conversation_id, direction, content, message_type, created_at, status')
            .eq('workspace_id', workspaceId)
            .in('conversation_id', batch)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1),
        );
      }
    }

    return streamingCsvResponse<MsgRow>(
      HISTORY_HEADERS,
      historyPages(),
      (m) => {
        const md = meta.get(m.conversation_id);
        return [
          md?.name ?? '', md?.phone ?? '', md?.channel ?? '', md?.agent ?? 'Unassigned',
          m.direction ?? '',
          m.direction === 'inbound' ? (md?.name ?? md?.phone ?? '') : 'Agent / Bot',
          m.content ?? '', m.message_type ?? 'text', m.status ?? '', toIST(m.created_at),
        ];
      },
      `conversations_history_${dateTag}`,
    );
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Conversations Export]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

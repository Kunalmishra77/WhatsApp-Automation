import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { paginateAll, exportResponse, streamingCsvResponse } from '@/lib/export-stream';
import { resolveRange, type QuickRange } from '@/lib/date-range';
import { escapeIlike, resolveMatchingContactIds, applyConversationFilters, applyConversationFlag } from '@/lib/conversation-filters';

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
  sentiment: string | null;
  unread_count: number | null;
  is_spam: boolean | null;
  first_replied_at: string | null;
  contacts: { name?: string | null; phone?: string | null } | null;
  profiles: { full_name?: string | null; email?: string | null } | null;
  campaigns: { name?: string | null } | null;
  // Embedded from the `conversations` side (leads.conversation_id has no unique
  // constraint), so PostgREST returns an array — ~1 row per conversation in
  // practice (see search route's LEADS_EMBED comment); first element is used.
  leads: Array<{ temperature?: string | null; stage?: string | null }> | null;
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
  'Sentiment', 'Temperature', 'Lead Stage', 'Source Campaign', 'First Replied At',
  'Unread Count', 'Is Spam',
];
const HISTORY_HEADERS = [
  'Contact Name', 'Phone', 'Channel', 'Assigned Agent', 'Direction', 'Sender',
  'Message', 'Type', 'Status', 'Timestamp (IST)',
];

// GET /api/conversations/export
//   ?workspaceId=&view=summary|history&format=csv
//   &status=&channel=&from=&to=&quick=
//   &temperature=&stage=&flag=unread|replied|unanswered|spam&assigned_agent_id=
//   &label=&sentiment=&q=&campaign_id=
//
// Filter set mirrors app/api/conversations/search/route.ts exactly (same helpers,
// via lib/conversation-filters.ts) so the exported rows match what the Conversations
// list shows for the same filters — "export what I'm looking at".
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const ctx = await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const view = sp.get('view') === 'history' ? 'history' : 'summary';
    const forceCsv = sp.get('format') === 'csv';

    // ── Parse the full filter set (same params/semantics as the search route) ──
    const from = sp.get('from');
    const to = sp.get('to');
    const dateTag = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);

    const quickParam = sp.get('quick') as QuickRange | null;
    let dateRange: { fromUtc: string; toUtc: string } | null = null;
    if (quickParam || (from && to)) {
      const r = resolveRange((quickParam || 'custom') as QuickRange, { from: from ?? undefined, to: to ?? undefined });
      dateRange = { fromUtc: r.fromUtc, toUtc: r.toUtc };
    }

    const status = sp.get('status') || undefined;
    const channel = sp.get('channel') || undefined;
    const assignedAgentId = sp.get('assigned_agent_id') || undefined;
    const sentiment = sp.get('sentiment') || undefined;
    const campaignId = sp.get('campaign_id') || undefined;
    const label = sp.get('label') || undefined;
    const flag = sp.get('flag') || undefined;
    const temperature = sp.get('temperature') || undefined;
    const stage = sp.get('stage') || undefined;
    const qRaw = (sp.get('q') || '').trim();
    const searchQ = qRaw ? escapeIlike(qRaw).slice(0, 100) : undefined;

    const needsLeadsJoin = Boolean(temperature || stage);
    // Resolved once so every query built off applyConvFilters below sees the same
    // contact match set for this `q` (mirrors search route).
    const matchingContactIds = searchQ ? await resolveMatchingContactIds(db, workspaceId, searchQ) : [];

    // Spam is excluded by default — same as the on-screen conversation list — unless
    // the caller explicitly asked for spam via flag=spam, so the exported set matches
    // what's visible in the UI for the same filters.
    const applyConvFilters = (q: any) => {
      let out = applyConversationFilters(q, {
        workspaceId, role: ctx.role, userId: ctx.userId,
        channel, status, assignedAgentId, sentiment, campaignId, label,
        temperature, stage, q: searchQ, dateRange,
      }, matchingContactIds);
      if (flag !== 'spam') out = out.eq('is_spam', false);
      return applyConversationFlag(out, flag);
    };

    // ── SUMMARY: one row per conversation, hybrid xlsx/csv ──────────────────────
    if (view === 'summary') {
      const countSelect = 'id' + (needsLeadsJoin ? ', leads!inner(temperature, stage)' : '');
      const { count, error: countErr } = await applyConvFilters(
        db.from('conversations').select(countSelect, { count: 'exact', head: true }),
      );
      if (countErr) {
        console.error('[ConvExport count]', countErr);
        return NextResponse.json({ error: 'Failed to count conversations' }, { status: 500 });
      }
      const summarySelect = `
        id, status, channel, last_message, last_message_at, created_at, labels, bot_paused,
        sentiment, unread_count, is_spam, first_replied_at,
        contacts(name, phone), profiles:assigned_agent_id(full_name, email),
        campaigns:source_campaign_id(name), leads${needsLeadsJoin ? '!inner' : ''}(temperature, stage)
      `;
      const pages = paginateAll<ConvRow>((offset, pageSize) =>
        applyConvFilters(db.from('conversations').select(summarySelect))
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
          c.sentiment ?? '',
          c.leads?.[0]?.temperature ?? '',
          c.leads?.[0]?.stage ?? '',
          c.campaigns?.name ?? '',
          toIST(c.first_replied_at),
          c.unread_count ?? 0,
          c.is_spam ? 'Yes' : 'No',
        ],
        filenameBase: `conversations_summary_${dateTag}`,
        sheetName: 'Summary',
      });
    }

    // ── HISTORY: one row per message, always streaming CSV ──────────────────────
    // Phase 1: page all matching conversation IDs (uncapped) + build a meta lookup.
    const meta = new Map<string, { name: string; phone: string; agent: string; channel: string }>();
    const metaSelect =
      'id, channel, contacts(name, phone), profiles:assigned_agent_id(full_name, email)' +
      (needsLeadsJoin ? ', leads!inner(temperature, stage)' : '');
    for await (const page of paginateAll<ConvRow>((offset, pageSize) =>
      applyConvFilters(db.from('conversations').select(metaSelect))
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

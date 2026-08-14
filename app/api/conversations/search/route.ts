import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, type QuickRange } from '@/lib/date-range';

export const runtime = 'nodejs';

// GET /api/conversations/search
//   ?workspaceId=&quick=&from=&to=&channel=&status=&campaign_id=&temperature=&stage=
//   &flag=unread|replied|unanswered|spam&assigned_agent_id=&label=&sentiment=&q=
//   &limit=30&offset=0
//
// Server-side filtered conversation search: page (limit/offset) + uncapped exact
// `total` + a `summary` of KPI-style bucket counts (each computed under the same
// non-flag filter context, per bucket). Workspace-scoped, auth-gated with the same
// permission every other /api/conversations/* mutation route uses.

const CONVERSATION_FIELDS =
  'id, workspace_id, contact_id, assigned_agent_id, status, channel, subject, last_message, ' +
  'last_message_at, unread_count, labels, is_pinned, is_starred, snoozed_until, sentiment, ' +
  'is_spam, bot_paused, first_replied_at, source_campaign_id, created_at, updated_at, ' +
  'contacts(id, name, phone, avatar_url)';

// Strip characters that are structural in the raw PostgREST filter strings we build
// by hand below (`,` separates or() conditions, `()` groups/wraps in-lists) so user
// input can never break out of the .or() clause. %/_/\ are ILIKE wildcards/escapes —
// stripped too so the search behaves as a plain, literal substring match.
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()%_\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

type TempBucket = 'hot' | 'warm' | 'cold';
function isTempBucket(v: unknown): v is TempBucket {
  return v === 'hot' || v === 'warm' || v === 'cold';
}

type ZeroSummary = {
  new_today: number; new_week: number; new_month: number;
  hot: number; warm: number; cold: number;
  unanswered: number; unread: number; total: number;
};
const ZERO_SUMMARY: ZeroSummary = {
  new_today: 0, new_week: 0, new_month: 0,
  hot: 0, warm: 0, cold: 0,
  unanswered: 0, unread: 0, total: 0,
};

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    // Same permission every other /api/conversations/* mutation route requires
    // (grep-confirmed: handle_conversations — there is no separate read-only
    // "view_conversations" permission in this codebase).
    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;

    // ── Parse params ─────────────────────────────────────────────────────────
    const quickParam = sp.get('quick') as QuickRange | null;
    const fromParam = sp.get('from') || undefined;
    const toParam = sp.get('to') || undefined;
    // Date filter only applied when the caller actually asked for a range —
    // conversation search defaults to all-time, not last_30_days.
    let dateRange: { fromUtc: string; toUtc: string } | null = null;
    if (quickParam || (fromParam && toParam)) {
      const r = resolveRange((quickParam || 'custom') as QuickRange, { from: fromParam, to: toParam });
      dateRange = { fromUtc: r.fromUtc, toUtc: r.toUtc };
    }

    const channel = sp.get('channel') || undefined;
    const status = sp.get('status') || undefined;
    const assignedAgentId = sp.get('assigned_agent_id') || undefined;
    const sentiment = sp.get('sentiment') || undefined;
    const campaignId = sp.get('campaign_id') || undefined;
    const label = sp.get('label') || undefined;
    const flag = sp.get('flag') || undefined; // unread | replied | unanswered | spam
    const temperature = sp.get('temperature') || undefined; // hot | warm | cold
    const stage = sp.get('stage') || undefined;
    const qRaw = (sp.get('q') || '').trim();
    const q = qRaw ? sanitizeSearchTerm(qRaw) : undefined;
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 30, 1), 200);
    const offset = Math.max(Number(sp.get('offset')) || 0, 0);

    // ── q: resolve matching contact ids (name/phone) up front — folded into the
    //      main .or() filter below as `contact_id.in.(...)` alongside a direct
    //      last_message ilike. Bounded by contacts-in-workspace matching the term;
    //      same acceptable-bound reasoning as the leads id-set lookups below. ─────
    let qContactIds: string[] = [];
    if (q) {
      const { data: contactRows, error: contactErr } = await db
        .from('contacts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
      if (contactErr) {
        console.error('[Conversations Search] contact lookup error:', contactErr.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      qContactIds = (contactRows ?? []).map((r: any) => r.id as string);
    }

    // ── temperature/stage filter: resolve matching conversation ids from leads.
    //      Empty result short-circuits to an empty page (no point querying further). ─
    let leadFilterIds: string[] | null = null;
    if (temperature || stage) {
      let lq = db
        .from('leads')
        .select('conversation_id')
        .eq('workspace_id', workspaceId)
        .not('conversation_id', 'is', null);
      if (temperature) lq = lq.eq('temperature', temperature);
      if (stage) lq = lq.eq('stage', stage);
      const { data: leadRows, error: leadErr } = await lq;
      if (leadErr) {
        console.error('[Conversations Search] lead filter error:', leadErr.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      const rawLeadConvIds: string[] = ((leadRows ?? []) as Array<{ conversation_id: string }>).map(
        (r) => r.conversation_id,
      );
      leadFilterIds = Array.from(new Set(rawLeadConvIds));
      if (leadFilterIds.length === 0) {
        return NextResponse.json({ conversations: [], total: 0, summary: ZERO_SUMMARY });
      }
    }

    // ── hot/warm/cold id-sets for the summary breakdown — always computed (the
    //      summary shows the full temperature split regardless of whether the
    //      caller is currently filtering by `temperature`). ─────────────────────
    const { data: tempRows, error: tempErr } = await db
      .from('leads')
      .select('conversation_id, temperature')
      .eq('workspace_id', workspaceId)
      .in('temperature', ['hot', 'warm', 'cold'])
      .not('conversation_id', 'is', null);
    if (tempErr) {
      console.error('[Conversations Search] temperature bucket error:', tempErr.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    const tempIdSets: Record<TempBucket, string[]> = { hot: [], warm: [], cold: [] };
    for (const row of (tempRows ?? []) as Array<{ conversation_id: string; temperature: string | null }>) {
      if (isTempBucket(row.temperature)) tempIdSets[row.temperature].push(row.conversation_id);
    }

    // ── Base filters shared by the page query + every summary count. Deliberately
    //     excludes `flag` and the temperature/stage id-set so the summary can show
    //     each bucket's count under the SAME other filters (date/channel/status/
    //     agent/sentiment/campaign/label/q) minus the one dimension being counted. ──
    function applyBase(qb: any) {
      qb = qb.eq('workspace_id', workspaceId);
      if (dateRange) qb = qb.gte('created_at', dateRange.fromUtc).lt('created_at', dateRange.toUtc);
      if (channel) qb = qb.eq('channel', channel);
      if (status) qb = qb.eq('status', status);
      if (assignedAgentId) qb = qb.eq('assigned_agent_id', assignedAgentId);
      if (sentiment) qb = qb.eq('sentiment', sentiment);
      if (campaignId) qb = qb.eq('source_campaign_id', campaignId);
      if (label) qb = qb.contains('labels', [label]);
      if (q) {
        const idList = qContactIds.length > 0 ? `,contact_id.in.(${qContactIds.join(',')})` : '';
        qb = qb.or(`last_message.ilike.%${q}%${idList}`);
      }
      return qb;
    }

    function applyFlag(qb: any) {
      if (flag === 'unread') return qb.gt('unread_count', 0);
      if (flag === 'replied') return qb.not('first_replied_at', 'is', null);
      if (flag === 'unanswered') return qb.is('first_replied_at', null);
      if (flag === 'spam') return qb.eq('is_spam', true);
      return qb;
    }

    // Full filter set for the page + the summary's own `total`.
    function applyFilters(qb: any) {
      qb = applyBase(qb);
      qb = applyFlag(qb);
      if (leadFilterIds) qb = qb.in('id', leadFilterIds);
      return qb;
    }

    const pageQuery = applyFilters(
      db.from('conversations').select(CONVERSATION_FIELDS, { count: 'exact' }),
    )
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const todayRange = resolveRange('today');
    const weekRange = resolveRange('this_week');
    const monthRange = resolveRange('this_month');
    const countCol = () => db.from('conversations').select('id', { count: 'exact', head: true });
    const inBucket = (ids: string[]) =>
      ids.length > 0
        ? applyBase(countCol()).in('id', ids)
        : Promise.resolve({ count: 0, error: null });

    // ── Page + summary, fanned out in parallel. Every summary count is a bare
    //     count:'exact', head:true query — uncapped, never `.select().length`. ──────
    const [
      pageResult,
      newTodayResult, newWeekResult, newMonthResult,
      hotResult, warmResult, coldResult,
      unansweredResult, unreadResult,
    ] = await Promise.all([
      pageQuery,
      applyBase(countCol()).gte('created_at', todayRange.fromUtc),
      applyBase(countCol()).gte('created_at', weekRange.fromUtc),
      applyBase(countCol()).gte('created_at', monthRange.fromUtc),
      inBucket(tempIdSets.hot),
      inBucket(tempIdSets.warm),
      inBucket(tempIdSets.cold),
      applyBase(countCol()).is('first_replied_at', null),
      applyBase(countCol()).gt('unread_count', 0),
    ]);

    const { data: conversations, error: pageErr, count: total } = pageResult;
    if (pageErr) {
      console.error('[Conversations Search] page query error:', pageErr.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    for (const [name, r] of [
      ['new_today', newTodayResult], ['new_week', newWeekResult], ['new_month', newMonthResult],
      ['hot', hotResult], ['warm', warmResult], ['cold', coldResult],
      ['unanswered', unansweredResult], ['unread', unreadResult],
    ] as const) {
      const err = (r as { error: { message: string } | null }).error;
      if (err) console.error(`[Conversations Search] summary(${name}) error:`, err.message);
    }

    const totalNum = Number(total ?? 0);
    return NextResponse.json({
      conversations: conversations ?? [],
      total: totalNum,
      summary: {
        new_today: Number(newTodayResult.count ?? 0),
        new_week: Number(newWeekResult.count ?? 0),
        new_month: Number(newMonthResult.count ?? 0),
        hot: Number((hotResult as { count: number | null }).count ?? 0),
        warm: Number((warmResult as { count: number | null }).count ?? 0),
        cold: Number((coldResult as { count: number | null }).count ?? 0),
        unanswered: Number(unansweredResult.count ?? 0),
        unread: Number(unreadResult.count ?? 0),
        total: totalNum,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Conversations Search]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

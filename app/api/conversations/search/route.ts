import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, type QuickRange } from '@/lib/date-range';
import { paginateAll } from '@/lib/export-stream';

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
//
// temperature/stage are filtered via an embedded `leads!inner(...)` join, NOT an
// id-set roundtrip — a bare `.select()` id lookup caps at PostgREST's default row
// limit (1000), which would silently miss conversations/undercount buckets for any
// workspace with >1000 leads of a given temperature. The embedded-join filter is a
// single query and is uncapped.

// Contact name/phone are NOT denormalized on `conversations` — they live only on the
// joined `contacts` table (confirmed via modules/conversations/services/
// conversation.service.ts: fetchConversations() selects `*, contacts(id,name,phone,
// avatar_url)`; conversations has no name/phone columns). Mixing an OR across a
// parent column (last_message) and an embedded child table's columns (contacts.name/
// phone) in one PostgREST `or=` expression is not a reliably-documented pattern, so
// `q` instead resolves matching contact ids up front (workspace-scoped, via
// `paginateAll` — NOT a bare capped `.select()`, so this stays uncapped past
// PostgREST's 1000-row default) and then filters conversations on
// `last_message.ilike.<value> OR contact_id.in.(...)`, both of which are plain
// columns on `conversations` itself. The ilike value is passed through
// quoteOrValue() before being embedded (see below) — hand-built `.or()` strings go
// through PostgREST's own DSL grammar, where `,` `(` `)` `"` are structural/quoting
// characters, not just ILIKE wildcards. The contact-id list is capped at
// CONTACT_ID_MATCH_CAP — see resolveMatchingContactIds below.
const CONVERSATION_FIELDS =
  'id, workspace_id, contact_id, assigned_agent_id, status, channel, subject, last_message, ' +
  'last_message_at, unread_count, labels, is_pinned, is_starred, snoozed_until, sentiment, ' +
  'is_spam, bot_paused, first_replied_at, source_campaign_id, created_at, updated_at, ' +
  'contacts(id, name, phone, avatar_url)';

// leads has ~1 row per conversation (the temperature trigger updates the single linked
// lead), so `leads!inner(...)` does not fan out conversation rows in practice. The page
// result is defensively deduped by conversation id below anyway; counts are exact under
// the 1:1 assumption.
const LEADS_EMBED = ', leads!inner(temperature,stage)';

// Escapes ILIKE's own wildcard/escape characters so user input behaves as a literal
// substring match rather than an accidental wildcard pattern. `.ilike()` is a
// parameterized supabase-js call (not a hand-built filter string), so there is no
// filter-injection concern here — this is purely about ILIKE semantics.
function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Hand-built `.or(...)` filter strings go through PostgREST's own DSL grammar, where
// `,` `(` `)` are structural delimiters (they separate/close individual conditions)
// and `"`/`\` are the DSL's own quoting/escape characters. `escapeIlike` above only
// escapes ILIKE's wildcard characters (`%` `_` `\`) — it says nothing about the outer
// DSL, so a value containing e.g. `,` or `(`/`)` (an ordinary parenthesized phone
// number like "(555) 123-4567") would silently split into extra bogus filter clauses
// or unbalance the expression (PostgREST 500), and a value containing `,is_spam.eq.
// false,` etc. could graft on attacker-controlled filter clauses.
//
// Per PostgREST's documented quoting rule, a value containing reserved characters is
// wrapped in double quotes, and within that quoted value a literal backslash is
// written `\\` and a literal double quote is written `\"`. Applying this AFTER the
// ILIKE-escaped value is built (so it doubles/escapes whatever backslashes
// `escapeIlike` already introduced) makes the whole thing round-trip correctly:
// PostgREST's quote-parser recovers exactly the ILIKE-escaped string, which Postgres'
// ILIKE then interprets as intended. Only used for the two `.or()` call sites below —
// `contact_id.in.(...)` is a separate, uuid-only list and needs no quoting.
function quoteOrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// Sanity bound on the resulting `.in()` id-list size for a broad `q` (e.g. a single
// common letter matching thousands of contacts) — NOT a silent correctness cap. The
// underlying paginateAll walk below is itself uncapped (pages through every matching
// row past PostgREST's 1000-row default); this only stops accumulating ids once the
// list is already large. Kept modest (not merely "generous") because every id here
// ends up in the `contact_id.in.(...)` URL query string, and a very long `.in()` list
// risks tripping proxy/header-size limits (e.g. nginx's default ~8K buffer) — 1000
// uuids is a ~37K list, comfortably under that; 5000 (~180K) would not be. Message-
// text matching is unaffected by this cap; it only bounds the contact-id half of `q`.
const CONTACT_ID_MATCH_CAP = 1000;

// Resolves every contact id in this workspace whose name or phone ilike-matches `q`,
// via `paginateAll` (uncapped — pages through all rows) rather than a bare `.select()`
// (which would silently cap at PostgREST's default 1000-row limit and undercount/miss
// conversations for any workspace with >1000 matching contacts). `q` must already be
// escapeIlike()'d by the caller; this function applies quoteOrValue() itself before
// embedding it in the `.or(...)` string.
async function resolveMatchingContactIds(db: any, workspaceId: string, q: string): Promise<string[]> {
  const pattern = quoteOrValue(`%${q}%`);
  const ids: string[] = [];
  outer: for await (const page of paginateAll<{ id: string }>((offset, pageSize) =>
    db
      .from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .or(`name.ilike.${pattern},phone.ilike.${pattern}`)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1),
  )) {
    for (const row of page) {
      ids.push(row.id);
      if (ids.length >= CONTACT_ID_MATCH_CAP) break outer;
    }
  }
  return ids;
}

type TempBucket = 'hot' | 'warm' | 'cold';

type Summary = {
  new_today: number; new_week: number; new_month: number;
  hot: number; warm: number; cold: number;
  unanswered: number; unread: number; total: number;
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
    const ctx = await requireWorkspacePermission(workspaceId, 'handle_conversations');

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
    const q = qRaw ? escapeIlike(qRaw).slice(0, 100) : undefined;
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 30, 1), 200);
    const offset = Math.max(Number(sp.get('offset')) || 0, 0);

    const needsLeadsJoin = Boolean(temperature || stage);

    // Resolved once (not per query) so the page query and every summary/bucket count
    // below — all of which route through applyBase — see the exact same set of
    // contact matches for this `q`.
    const matchingContactIds = q ? await resolveMatchingContactIds(db, workspaceId, q) : [];

    // ── Base filters shared by the page query + every summary count EXCEPT the
    //     hot/warm/cold breakdown. `includeTemperature` lets the hot/warm/cold
    //     buckets reuse this with the temperature dimension stripped out (so the
    //     3-way split always reflects the full breakdown, not just the currently
    //     selected bucket) while still respecting an active `stage` filter. ────────
    function applyBase(
      qb: any,
      { includeTemperature = true, excludeSpam = true }: { includeTemperature?: boolean; excludeSpam?: boolean } = {},
    ) {
      qb = qb.eq('workspace_id', workspaceId);
      // Agent-role members bypass RLS here (admin client), so this route must
      // replicate the same assignment-isolation restriction migration 049 enforces
      // at the DB layer — mirrors app/api/conversations/export/route.ts and
      // app/api/contacts/bulk/route.ts. Applied in applyBase so the page query,
      // `total`, and every summary/bucket count are scoped identically.
      if (ctx.role === 'agent') qb = qb.eq('assigned_agent_id', ctx.userId);
      // Spam exclusion is caller-controlled (not derived from `flag` in here), so the
      // summary/bucket counts below can always stay spam-free KPIs regardless of the
      // active flag, while the page query is the only place that ever opts back in
      // (via flag=spam, applied by applyFlag after this).
      if (excludeSpam) qb = qb.eq('is_spam', false);
      if (dateRange) qb = qb.gte('created_at', dateRange.fromUtc).lt('created_at', dateRange.toUtc);
      if (channel) qb = qb.eq('channel', channel);
      if (status) qb = qb.eq('status', status);
      if (assignedAgentId) qb = qb.eq('assigned_agent_id', assignedAgentId);
      if (sentiment) qb = qb.eq('sentiment', sentiment);
      if (campaignId) qb = qb.eq('source_campaign_id', campaignId);
      if (label) qb = qb.contains('labels', [label]);
      if (includeTemperature && temperature) qb = qb.eq('leads.temperature', temperature);
      if (stage) qb = qb.eq('leads.stage', stage);
      // Matches message text OR the linked contact's name/phone. Both sides are
      // plain columns on `conversations` itself (last_message, contact_id), so a
      // single `.or()` is safe/documented here — unlike trying to OR across an
      // embedded child table's columns directly. contactIds was resolved uncapped
      // via paginateAll above; falls back to message-only when q matched no contacts.
      // last_message's value goes through quoteOrValue() — contact_id.in.(...) is a
      // uuid-only list and needs no quoting.
      if (q) {
        qb = matchingContactIds.length > 0
          ? qb.or(`last_message.ilike.${quoteOrValue(`%${q}%`)},contact_id.in.(${matchingContactIds.join(',')})`)
          : qb.ilike('last_message', `%${q}%`);
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

    // ── Page + total ─────────────────────────────────────────────────────────
    // Page respects the active flag: flag=spam shows spam-only (excludeSpam:false,
    // then applyFlag adds is_spam=true below); any other/no flag excludes spam.
    const pageSelect = CONVERSATION_FIELDS + (needsLeadsJoin ? LEADS_EMBED : '');
    const pageQuery = applyFlag(
      applyBase(db.from('conversations').select(pageSelect, { count: 'exact' }), { excludeSpam: flag !== 'spam' }),
    )
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    // ── Summary (parallel, uncapped count:'exact' head queries) ────────────────
    // Always spam-free KPIs, regardless of the active flag — summary counts never
    // call applyFlag(), so leaving excludeSpam at its default (true) here would be
    // equally correct, but it's spelled out explicitly since this is the one place
    // that must never vary with `flag`.
    //
    // Only computed on the first page (offset === 0) — "load more" requests re-send
    // the exact same filters with a higher offset, so the summary counts would be
    // identical to what page 0 already returned. The UI (useConversations) only ever
    // reads pages[0].summary, so skipping this on later pages is a pure perf win
    // (8 fewer count:'exact' queries per load-more) with no behavior change.
    let summary: Summary | null = null;
    let pageResult: any;
    if (offset === 0) {
      const todayRange = resolveRange('today');
      const weekRange = resolveRange('this_week');
      const monthRange = resolveRange('this_month');
      const countSelect = 'id' + (needsLeadsJoin ? LEADS_EMBED : '');
      const countCol = () => db.from('conversations').select(countSelect, { count: 'exact', head: true });
      // hot/warm/cold always need the leads join, regardless of whether temperature/
      // stage is currently being filtered on.
      const bucketCol = () => db.from('conversations').select('id' + LEADS_EMBED, { count: 'exact', head: true });
      const bucketCount = (bucket: TempBucket) =>
        applyBase(bucketCol(), { includeTemperature: false, excludeSpam: true }).eq('leads.temperature', bucket);

      let newTodayResult, newWeekResult, newMonthResult,
        hotResult, warmResult, coldResult,
        unansweredResult, unreadResult;
      [
        pageResult,
        newTodayResult, newWeekResult, newMonthResult,
        hotResult, warmResult, coldResult,
        unansweredResult, unreadResult,
      ] = await Promise.all([
        pageQuery,
        applyBase(countCol(), { excludeSpam: true }).gte('created_at', todayRange.fromUtc),
        applyBase(countCol(), { excludeSpam: true }).gte('created_at', weekRange.fromUtc),
        applyBase(countCol(), { excludeSpam: true }).gte('created_at', monthRange.fromUtc),
        bucketCount('hot'),
        bucketCount('warm'),
        bucketCount('cold'),
        applyBase(countCol(), { excludeSpam: true }).is('first_replied_at', null),
        applyBase(countCol(), { excludeSpam: true }).gt('unread_count', 0),
      ]);

      for (const [name, r] of [
        ['new_today', newTodayResult], ['new_week', newWeekResult], ['new_month', newMonthResult],
        ['hot', hotResult], ['warm', warmResult], ['cold', coldResult],
        ['unanswered', unansweredResult], ['unread', unreadResult],
      ] as const) {
        const err = (r as { error: { message: string } | null }).error;
        if (err) console.error(`[Conversations Search] summary(${name}) error:`, err.message);
      }

      summary = {
        new_today: Number(newTodayResult.count ?? 0),
        new_week: Number(newWeekResult.count ?? 0),
        new_month: Number(newMonthResult.count ?? 0),
        hot: Number((hotResult as { count: number | null }).count ?? 0),
        warm: Number((warmResult as { count: number | null }).count ?? 0),
        cold: Number((coldResult as { count: number | null }).count ?? 0),
        unanswered: Number(unansweredResult.count ?? 0),
        unread: Number(unreadResult.count ?? 0),
        total: 0, // filled in below once `total` is known
      };
    } else {
      pageResult = await pageQuery;
    }

    const { data: pageRows, error: pageErr, count: total } = pageResult;
    if (pageErr) {
      console.error('[Conversations Search] page query error:', pageErr.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Defensive dedup by conversation id — protects the page (small, bounded by
    // `limit`) against the unlikely case of a conversation having >1 linked lead
    // when the leads!inner join is active; counts stay exact under the normal 1:1 case.
    const seen = new Set<string>();
    const conversations = ((pageRows ?? []) as Array<{ id: string }>).filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    const totalNum = Number(total ?? 0);
    if (summary) summary.total = totalNum;

    return NextResponse.json({ conversations, total: totalNum, summary });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Conversations Search]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

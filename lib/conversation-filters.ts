// lib/conversation-filters.ts — shared conversation filter-building helpers.
// Extracted from app/api/conversations/search/route.ts so /api/conversations/export
// can apply the exact same filter set ("export what I'm looking at"). Keep both call
// sites in sync with this file rather than re-forking the logic.
import { paginateAll } from '@/lib/export-stream';

// Escapes ILIKE's own wildcard/escape characters so user input behaves as a literal
// substring match rather than an accidental wildcard pattern. `.ilike()` is a
// parameterized supabase-js call (not a hand-built filter string), so there is no
// filter-injection concern here — this is purely about ILIKE semantics.
export function escapeIlike(raw: string): string {
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
// ILIKE then interprets as intended.
export function quoteOrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// Sanity bound on the resulting `.in()` id-list size for a broad `q` (e.g. a single
// common letter matching thousands of contacts) — NOT a silent correctness cap. The
// underlying paginateAll walk is itself uncapped (pages through every matching row
// past PostgREST's 1000-row default); this only stops accumulating ids once the list
// is already large. Kept modest because every id here ends up in the
// `contact_id.in.(...)` URL query string, and a very long `.in()` list risks tripping
// proxy/header-size limits: 1000 uuids is a ~37K URL, 5000 (~180K) far worse. That
// already exceeds a strict nginx-style ~8K header buffer, but Supabase's gateway
// permits much longer URLs (this works in production today) — 1000 is the pragmatic
// ceiling; lower it if a fronting proxy ever rejects the request. Message-text
// matching is unaffected by this cap; it only bounds the contact-id half of `q`.
export const CONTACT_ID_MATCH_CAP = 1000;

// Resolves every contact id in this workspace whose name or phone ilike-matches `q`,
// via `paginateAll` (uncapped — pages through all rows) rather than a bare `.select()`
// (which would silently cap at PostgREST's default 1000-row limit and undercount/miss
// conversations for any workspace with >1000 matching contacts). `q` must already be
// escapeIlike()'d by the caller; this function applies quoteOrValue() itself before
// embedding it in the `.or(...)` string.
export async function resolveMatchingContactIds(db: any, workspaceId: string, q: string): Promise<string[]> {
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

export interface ConversationFilterParams {
  workspaceId: string;
  role: string; // AuthzContext['role']
  userId: string;
  channel?: string;
  status?: string;
  assignedAgentId?: string;
  sentiment?: string;
  campaignId?: string;
  label?: string;
  temperature?: string;
  stage?: string;
  flag?: string;
  q?: string; // already escapeIlike()'d + length-capped by the caller
  dateRange?: { fromUtc: string; toUtc: string } | null;
}

// Applies the same non-flag filter dimensions app/api/conversations/search/route.ts's
// applyBase() applies: workspace scope, agent-role assignment isolation, channel,
// status, assigned agent, sentiment, campaign, label, temperature/stage (via the
// leads join — caller must embed `leads(temperature,stage)` or `leads!inner(...)`
// depending on whether it needs the join to also restrict parent rows), q (message
// text OR contact name/phone), and the resolved date range (on created_at).
//
// `matchingContactIds` must be resolved once by the caller (via
// resolveMatchingContactIds) and passed in, so every query built from the same
// filter set sees an identical contact match list.
export function applyConversationFilters(qb: any, params: ConversationFilterParams, matchingContactIds: string[]) {
  const { workspaceId, role, userId, channel, status, assignedAgentId, sentiment, campaignId, label, temperature, stage, q, dateRange } = params;

  qb = qb.eq('workspace_id', workspaceId);
  // Agent-role members bypass RLS here (admin client), so this must replicate the
  // same assignment-isolation restriction migration 049 enforces at the DB layer.
  if (role === 'agent') qb = qb.eq('assigned_agent_id', userId);
  if (dateRange) qb = qb.gte('created_at', dateRange.fromUtc).lt('created_at', dateRange.toUtc);
  if (channel) qb = qb.eq('channel', channel);
  if (status) qb = qb.eq('status', status);
  if (assignedAgentId) qb = qb.eq('assigned_agent_id', assignedAgentId);
  if (sentiment) qb = qb.eq('sentiment', sentiment);
  if (campaignId) qb = qb.eq('source_campaign_id', campaignId);
  if (label) qb = qb.contains('labels', [label]);
  if (temperature) qb = qb.eq('leads.temperature', temperature);
  if (stage) qb = qb.eq('leads.stage', stage);
  if (q) {
    qb = matchingContactIds.length > 0
      ? qb.or(`last_message.ilike.${quoteOrValue(`%${q}%`)},contact_id.in.(${matchingContactIds.join(',')})`)
      : qb.ilike('last_message', `%${q}%`);
  }
  return qb;
}

// Mirrors search route's applyFlag(): unread=unread_count>0, replied=first_replied_at
// not null, unanswered=first_replied_at is null, spam=is_spam true. Any other/no flag
// is a no-op (caller decides spam inclusion/exclusion separately, if it needs to).
export function applyConversationFlag(qb: any, flag: string | undefined) {
  if (flag === 'unread') return qb.gt('unread_count', 0);
  if (flag === 'replied') return qb.not('first_replied_at', 'is', null);
  if (flag === 'unanswered') return qb.is('first_replied_at', null);
  if (flag === 'spam') return qb.eq('is_spam', true);
  return qb;
}

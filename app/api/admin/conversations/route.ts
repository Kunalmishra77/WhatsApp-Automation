// app/api/admin/conversations/route.ts
// Platform-admin "Client Inboxes" oversight — lists ANY client workspace's
// conversations so the owner can view (and, via the sibling routes, reply into)
// them. Uses createAdminClient() (bypasses RLS) and is NOT gated on workspace
// membership (the platform admin is deliberately not a member) — so the ONLY
// thing protecting cross-tenant data here is requirePlatformAdmin() below, which
// runs before ANY data access.
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { authzResponse, AuthzError } from '@/lib/authz';
import { resolveRange, type QuickRange } from '@/lib/date-range';
import {
  escapeIlike,
  resolveMatchingContactIds,
  applyConversationFilters,
  applyConversationFlag,
} from '@/lib/conversation-filters';

export const runtime = 'nodejs';

// Same field set the client-facing search route returns, incl. the joined contact
// (name/phone/avatar) — contact identity is NOT denormalized on `conversations`.
const CONVERSATION_FIELDS =
  'id, workspace_id, contact_id, assigned_agent_id, status, channel, subject, last_message, ' +
  'last_message_at, unread_count, labels, is_pinned, is_starred, snoozed_until, sentiment, ' +
  'is_spam, bot_paused, first_replied_at, source_campaign_id, created_at, updated_at, ' +
  'contacts(id, name, phone, avatar_url)';

const LEADS_EMBED = ', leads!inner(temperature,stage)';

// GET /api/admin/conversations
//   ?workspaceId=<required>&quick=&from=&to=&channel=&status=&campaign_id=
//   &temperature=&stage=&flag=unread|replied|unanswered|spam&assigned_agent_id=
//   &label=&sentiment=&q=&limit=30&offset=0
//
// Returns the TARGET workspace's conversations (page + exact `total`), reusing the
// shared filter helper but with NO agent isolation (the platform admin is not an
// agent — it sees ALL of the target workspace's conversations). Always
// workspace-scoped to the given workspaceId; never mixes workspaces in one response.
export async function GET(request: NextRequest) {
  try {
    // SECURITY: platform-admin gate BEFORE any data access. This route touches
    // arbitrary workspaces via the admin (RLS-bypassing) client, so this is the
    // sole cross-tenant guard.
    const ctx = await requirePlatformAdmin();

    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    // ── Parse params (same names/semantics as /api/conversations/search) ───────
    const quickParam = sp.get('quick') as QuickRange | null;
    const fromParam = sp.get('from') || undefined;
    const toParam = sp.get('to') || undefined;
    // Date filter only applied when a range was actually requested (defaults to all-time).
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

    // Resolved once so the page query sees a stable contact-match set for `q`.
    const matchingContactIds = q ? await resolveMatchingContactIds(db, workspaceId, q) : [];

    // Builds the full filter set via the shared helper. Passing role 'super_admin'
    // (NOT 'agent') means the helper applies NO assignment-isolation restriction —
    // the platform admin sees every conversation in the target workspace. This does
    // not alter the helper's behavior for the search/export callers, which still
    // pass their real role (agent isolation still applies there for role 'agent').
    const applyConvFilters = (qb: any) => {
      let out = applyConversationFilters(qb, {
        workspaceId,
        role: 'super_admin',
        userId: ctx.userId,
        channel, status, assignedAgentId, sentiment, campaignId, label,
        temperature, stage, q, dateRange,
      }, matchingContactIds);
      // Exclude spam by default unless the caller explicitly asked for spam-only —
      // mirrors the on-screen conversation list / export behavior.
      if (flag !== 'spam') out = out.eq('is_spam', false);
      return applyConversationFlag(out, flag);
    };

    const pageSelect = CONVERSATION_FIELDS + (needsLeadsJoin ? LEADS_EMBED : '');
    const { data: pageRows, error: pageErr, count: total } = await applyConvFilters(
      db.from('conversations').select(pageSelect, { count: 'exact' }),
    )
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (pageErr) {
      console.error('[AdminInbox list] page query error:', pageErr.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Defensive dedup by conversation id (guards against >1 linked lead when the
    // leads!inner join is active; 1:1 in practice).
    const seen = new Set<string>();
    const conversations = ((pageRows ?? []) as Array<{ id: string }>).filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    return NextResponse.json({ conversations, total: Number(total ?? 0) });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminInbox list]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

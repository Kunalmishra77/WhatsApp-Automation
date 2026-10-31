import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { resolveActiveWorkspaceId } from '@/lib/active-workspace';
import { requireWorkspacePermissionAny, authzResponse, AuthzError } from '@/lib/authz';
import { paginateAll, streamingCsvResponse } from '@/lib/export-stream';
import { applyPlatformFilter } from '@/lib/meta-leads-filter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface MetaConv {
  id: string;
  status: string | null;
  created_at: string | null;
  meta: { ad_source?: { platform?: string; headline?: string; body?: string; ad_id?: string; ctwa_clid?: string; source?: string } } | null;
  contact: { name?: string | null; phone?: string | null } | null;
  /** At most one row: the earliest inbound message, ordered and limited in the query. */
  messages: Array<{ content?: string | null; created_at?: string | null }> | null;
}

const HEADERS = [
  'Name', 'Phone', 'Platform', 'Ad Headline', 'Ad Body', 'Ad ID', 'CTWA Click ID', 'Source',
  'First Message', 'Conversation Date', 'Status',
];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolves the workspace the user actually has open. The old `.single()` membership
  // lookup here 403'd for anyone who belonged to more than one workspace.
  const workspaceId = await resolveActiveWorkspaceId(user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  // Meta Leads is an admin-grantable page, so enforce the grant on its export too.
  try {
    await requireWorkspacePermissionAny(workspaceId, ['view_analytics']);
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    throw e;
  }
  const sp = new URL(req.url).searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const platform = sp.get('platform');
  const status = sp.get('status');

  const applyFilters = (q: any) => {
    q = q.eq('workspace_id', workspaceId).contains('labels', ['Meta Ad Lead']);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to + 'T23:59:59Z');
    if (status) q = q.eq('status', status);
    // Platform too, in the query rather than per page in JS — the same filter
    // the list uses, so a CSV and the screen it was exported from cannot
    // disagree about which leads are Instagram's.
    return applyPlatformFilter(q, platform);
  };

  // The CSV has one column from `messages`: the customer's opening message. The
  // embed used to fetch EVERY message of every conversation — both directions, no
  // limit — and JS then filtered to inbound, sorted and took the first. The
  // database does all three now, which is why this export reads one row per
  // conversation instead of a whole thread (3.2 on average, 57 at worst).
  async function* pages(): AsyncGenerator<MetaConv[]> {
    for await (const page of paginateAll<MetaConv>((offset, pageSize) =>
      applyFilters(supabase.from('conversations').select(`
        id, status, created_at, meta,
        contact:contacts!contact_id(name, phone),
        messages(content, created_at)
      `))
        .eq('messages.direction', 'inbound')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .order('created_at', { referencedTable: 'messages', ascending: true })
        .limit(1, { referencedTable: 'messages' })
        .range(offset, offset + pageSize - 1),
    )) {
      yield page;
    }
  }

  const dateTag = new Date().toISOString().slice(0, 10);
  const parts = ['meta-leads', dateTag];
  if (platform) parts.push(platform);
  if (status) parts.push(status);

  return streamingCsvResponse<MetaConv>(HEADERS, pages(), (row) => {
    const ad = row.meta?.ad_source ?? {};
    // The one row the embed returns: inbound, earliest first, limited to 1 above.
    const firstMsg = (row.messages ?? [])[0];
    return [
      row.contact?.name ?? '', row.contact?.phone ?? '', ad.platform ?? 'facebook',
      ad.headline ?? '', ad.body ?? '', ad.ad_id ?? '', ad.ctwa_clid ?? '', ad.source ?? '',
      firstMsg?.content ?? '', row.created_at?.slice(0, 10) ?? '', row.status ?? '',
    ];
  }, parts.join('_'));
}

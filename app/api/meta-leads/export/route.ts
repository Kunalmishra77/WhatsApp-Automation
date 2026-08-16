import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { paginateAll, streamingCsvResponse } from '@/lib/export-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface MetaConv {
  id: string;
  status: string | null;
  created_at: string | null;
  meta: { ad_source?: { platform?: string; headline?: string; body?: string; ad_id?: string; ctwa_clid?: string; source?: string } } | null;
  contact: { name?: string | null; phone?: string | null } | null;
  messages: Array<{ content?: string | null; direction?: string | null; created_at?: string | null }> | null;
}

const HEADERS = [
  'Name', 'Phone', 'Platform', 'Ad Headline', 'Ad Body', 'Ad ID', 'CTWA Click ID', 'Source',
  'First Message', 'Conversation Date', 'Status',
];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await (supabase as any)
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).single();
  if (!member?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const workspaceId: string = member.workspace_id;
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
    return q;
  };

  // Platform lives in a nested JSONB field not filterable via PostgREST — filter per page in JS.
  async function* pages(): AsyncGenerator<MetaConv[]> {
    for await (const page of paginateAll<MetaConv>((offset, pageSize) =>
      applyFilters(supabase.from('conversations').select(`
        id, status, created_at, meta,
        contact:contacts!contact_id(name, phone),
        messages(content, direction, created_at)
      `))
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    )) {
      yield platform
        ? page.filter((r) => (r.meta?.ad_source?.platform ?? 'facebook') === platform)
        : page;
    }
  }

  const dateTag = new Date().toISOString().slice(0, 10);
  const parts = ['meta-leads', dateTag];
  if (platform) parts.push(platform);
  if (status) parts.push(status);

  return streamingCsvResponse<MetaConv>(HEADERS, pages(), (row) => {
    const ad = row.meta?.ad_source ?? {};
    const firstMsg = (row.messages ?? [])
      .filter((m) => m.direction === 'inbound')
      .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())[0];
    return [
      row.contact?.name ?? '', row.contact?.phone ?? '', ad.platform ?? 'facebook',
      ad.headline ?? '', ad.body ?? '', ad.ad_id ?? '', ad.ctwa_clid ?? '', ad.source ?? '',
      firstMsg?.content ?? '', row.created_at?.slice(0, 10) ?? '', row.status ?? '',
    ];
  }, parts.join('_'));
}

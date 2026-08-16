import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { paginateAll } from '@/lib/export-stream';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await (supabase as any)
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single();
  if (!member?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const workspaceId: string = member.workspace_id;
  const { searchParams } = new URL(req.url);
  const page     = parseInt(searchParams.get('page') ?? '1', 10);
  const limit    = 25;
  const offset   = (page - 1) * limit;
  const platform = searchParams.get('platform');
  const status   = searchParams.get('status');
  const from     = searchParams.get('from');
  const to       = searchParams.get('to');

  // Filter by "Meta Ad Lead" label — reliable TEXT[] filter that Supabase JS handles natively
  // (JSONB path filter `.not('meta->ad_source','is',null)` is not supported by PostgREST)
  let q = (supabase as any)
    .from('conversations')
    .select(`
      id, status, created_at, meta, labels,
      contact:contacts!contact_id(id, name, phone),
      messages!inner(content, direction, created_at)
    `, { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .contains('labels', ['Meta Ad Lead'])
    .eq('messages.direction', 'inbound')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq('status', status);
  if (from)   q = q.gte('created_at', from);
  if (to)     q = q.lte('created_at', to + 'T23:59:59Z');

  const { data: rows, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let leads = (rows ?? []).map((row: any) => {
    const adSource = row.meta?.ad_source ?? {};
    const firstMsg = (row.messages ?? [])
      .filter((m: any) => m.direction === 'inbound')
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

    return {
      id:               row.id,
      status:           row.status,
      created_at:       row.created_at,
      contact:          row.contact,
      platform:         adSource.platform ?? 'facebook',
      ad_headline:      adSource.headline ?? null,
      ad_body:          adSource.body ?? null,
      ad_id:            adSource.ad_id ?? null,
      ctwa_clid:        adSource.ctwa_clid ?? null,
      first_message:    firstMsg?.content ?? null,
      first_message_at: firstMsg?.created_at ?? row.created_at,
    };
  });

  if (platform) leads = leads.filter((l: any) => l.platform === platform);

  // KPI queries — same fix: use label contains filter
  const now      = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { count: totalCount } = await (supabase as any)
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .contains('labels', ['Meta Ad Lead']);

  const { count: todayCount } = await (supabase as any)
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .contains('labels', ['Meta Ad Lead'])
    .gte('created_at', todayStr);

  const { count: monthCount } = await (supabase as any)
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .contains('labels', ['Meta Ad Lead'])
    .gte('created_at', `${monthStr}-01`);

  // ── Per-ad breakdown (Top Ads) ────────────────────────────────────────────
  // Uncapped: paginate through ALL ad-lead conversations (not a single capped
  // select) and group by ad_id/headline in JS, since the ad fields live in a
  // JSONB column that PostgREST cannot GROUP BY server-side.
  type AdConv = { id: string; meta: { ad_source?: { ad_id?: string; headline?: string } } | null };
  const adConvs: AdConv[] = [];
  for await (const pageRows of paginateAll<AdConv>((offset, pageSize) =>
    (supabase as any)
      .from('conversations')
      .select('id, meta')
      .eq('workspace_id', workspaceId)
      .contains('labels', ['Meta Ad Lead'])
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1),
  )) {
    adConvs.push(...pageRows);
  }

  // Revenue per ad: sum converted-lead value, joined by conversation_id. Uncapped
  // fetch of this workspace's converted leads, then mapped onto the ad conversations.
  const convValue = new Map<string, number>();
  for await (const pageRows of paginateAll<{ conversation_id: string | null; value: number | null }>((offset, pageSize) =>
    (supabase as any)
      .from('leads')
      .select('conversation_id, value')
      .eq('workspace_id', workspaceId)
      .eq('stage', 'converted')
      .not('conversation_id', 'is', null)
      .order('conversation_id', { ascending: true })
      .range(offset, offset + pageSize - 1),
  )) {
    for (const l of pageRows) {
      if (!l.conversation_id) continue;
      convValue.set(l.conversation_id, (convValue.get(l.conversation_id) ?? 0) + (l.value ?? 0));
    }
  }

  const adMap = new Map<string, { ad_id: string | null; headline: string | null; lead_count: number; revenue: number }>();
  for (const c of adConvs) {
    const ad = c.meta?.ad_source ?? {};
    const adId = ad.ad_id ?? null;
    const headline = ad.headline ?? null;
    const key = adId ?? headline ?? 'unknown';
    const entry = adMap.get(key) ?? { ad_id: adId, headline, lead_count: 0, revenue: 0 };
    entry.lead_count += 1;
    entry.revenue += convValue.get(c.id) ?? 0;
    // Prefer a non-null headline if a later row has one
    if (!entry.headline && headline) entry.headline = headline;
    adMap.set(key, entry);
  }

  const topAds = Array.from(adMap.values())
    .sort((a, b) => b.lead_count - a.lead_count || b.revenue - a.revenue)
    .slice(0, 50);

  return NextResponse.json({
    leads,
    total:      count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / limit),
    kpis: {
      total:      totalCount ?? 0,
      today:      todayCount ?? 0,
      this_month: monthCount ?? 0,
    },
    topAds,
  });
}

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const workspaceId: string = profile.workspace_id;
  const { searchParams } = new URL(req.url);
  const page     = parseInt(searchParams.get('page') ?? '1', 10);
  const limit    = 25;
  const offset   = (page - 1) * limit;
  const platform = searchParams.get('platform');  // 'facebook' | 'instagram' | null
  const status   = searchParams.get('status');    // 'open' | 'resolved' | null
  const from     = searchParams.get('from');
  const to       = searchParams.get('to');

  // ── Build base query — conversations with ad_source in meta ──────────────
  let q = (supabase as any)
    .from('conversations')
    .select(`
      id, status, created_at, meta, labels,
      contact:contacts!contact_id(id, name, phone),
      messages!inner(content, direction, created_at)
    `, { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .not('meta->ad_source', 'is', null)
    .eq('messages.direction', 'inbound')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq('status', status);
  if (from)   q = q.gte('created_at', from);
  if (to)     q = q.lte('created_at', to + 'T23:59:59Z');

  const { data: rows, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Filter by platform (ad_source.platform stored in meta JSONB) ──────────
  let leads = (rows ?? []).map((row: any) => {
    const adSource = row.meta?.ad_source ?? {};
    // First inbound message = first customer message
    const firstMsg = (row.messages ?? [])
      .filter((m: any) => m.direction === 'inbound')
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

    return {
      id:           row.id,
      status:       row.status,
      created_at:   row.created_at,
      contact:      row.contact,
      platform:     adSource.platform ?? 'facebook',
      ad_headline:  adSource.headline ?? null,
      ad_body:      adSource.body ?? null,
      ad_id:        adSource.ad_id ?? null,
      ctwa_clid:    adSource.ctwa_clid ?? null,
      first_message: firstMsg?.content ?? null,
      first_message_at: firstMsg?.created_at ?? row.created_at,
    };
  });

  if (platform) leads = leads.filter((l: any) => l.platform === platform);

  // ── KPI summary ────────────────────────────────────────────────────────────
  const now     = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { count: totalCount } = await (supabase as any)
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .not('meta->ad_source', 'is', null);

  const { count: todayCount } = await (supabase as any)
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .not('meta->ad_source', 'is', null)
    .gte('created_at', todayStr);

  const { count: monthCount } = await (supabase as any)
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .not('meta->ad_source', 'is', null)
    .gte('created_at', `${monthStr}-01`);

  return NextResponse.json({
    leads,
    total:       count ?? 0,
    page,
    totalPages:  Math.ceil((count ?? 0) / limit),
    kpis: {
      total:      totalCount ?? 0,
      today:      todayCount ?? 0,
      this_month: monthCount ?? 0,
    },
  });
}

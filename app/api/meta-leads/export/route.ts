import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';

function toCSV(headers: string[], rows: string[][]): string {
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(esc), ...rows.map((r) => r.map(esc))].join('\n');
}

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
  const from     = searchParams.get('from');
  const to       = searchParams.get('to');
  const platform = searchParams.get('platform'); // 'facebook' | 'instagram'
  const status   = searchParams.get('status');   // 'open' | 'resolved'

  let q = (supabase as any)
    .from('conversations')
    .select(`
      id, status, created_at, meta,
      contact:contacts!contact_id(name, phone),
      messages(content, direction, created_at)
    `)
    .eq('workspace_id', workspaceId)
    .contains('labels', ['Meta Ad Lead'])
    .order('created_at', { ascending: false })
    .limit(5000);

  if (from)     q = q.gte('created_at', from);
  if (to)       q = q.lte('created_at', to + 'T23:59:59Z');
  if (status)   q = q.eq('status', status);
  // platform is stored inside meta->ad_source->platform; filter in JS after fetch

  const { data: rawRows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Platform filter applied in JS (JSONB nested field not filterable via PostgREST)
  const rows = platform
    ? (rawRows ?? []).filter((r: any) => (r.meta?.ad_source?.platform ?? 'facebook') === platform)
    : (rawRows ?? []);

  const headers = [
    'Name', 'Phone', 'Platform', 'Ad Headline', 'Ad Body', 'Ad ID', 'Source',
    'First Message', 'Conversation Date', 'Status',
  ];

  const csvRows = rows.map((row: any) => {
    const ad = row.meta?.ad_source ?? {};
    const firstMsg = (row.messages ?? [])
      .filter((m: any) => m.direction === 'inbound')
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

    return [
      row.contact?.name            ?? '',
      row.contact?.phone           ?? '',
      ad.platform                  ?? 'facebook',
      ad.headline                  ?? '',
      ad.body                      ?? '',
      ad.ad_id                     ?? '',
      ad.source                    ?? '',   // 'referral' | 'prefill_match' | 'prefill_backfill'
      firstMsg?.content            ?? '',
      row.created_at?.slice(0, 10) ?? '',
      row.status                   ?? '',
    ];
  });

  const csv = toCSV(headers, csvRows);
  const date = new Date().toISOString().slice(0, 10);
  const parts = ['meta-leads', date];
  if (platform) parts.push(platform);
  if (status)   parts.push(status);
  if (from)     parts.push(`from-${from}`);
  if (to)       parts.push(`to-${to}`);
  const filename = parts.join('_') + '.csv';

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

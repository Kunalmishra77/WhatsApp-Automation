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

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const workspaceId: string = profile.workspace_id;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');

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

  if (from) q = q.gte('created_at', from);
  if (to)   q = q.lte('created_at', to + 'T23:59:59Z');

  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headers = [
    'Name', 'Phone', 'Platform', 'Ad Headline', 'Ad Body', 'Ad ID',
    'First Message', 'Conversation Date', 'Status',
  ];

  const csvRows = (rows ?? []).map((row: any) => {
    const ad = row.meta?.ad_source ?? {};
    const firstMsg = (row.messages ?? [])
      .filter((m: any) => m.direction === 'inbound')
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

    return [
      row.contact?.name       ?? '',
      row.contact?.phone      ?? '',
      ad.platform             ?? 'facebook',
      ad.headline             ?? '',
      ad.body                 ?? '',
      ad.ad_id                ?? '',
      firstMsg?.content       ?? '',
      row.created_at?.slice(0, 10) ?? '',
      row.status              ?? '',
    ];
  });

  const csv = toCSV(headers, csvRows);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="meta-leads-${date}.csv"`,
    },
  });
}

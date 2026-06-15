import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get('workspaceId');
  const eventType   = searchParams.get('type'); // optional filter
  const status      = searchParams.get('status');
  const limit       = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

  const db = createAdminClient() as any;

  // Verify membership
  const { data: member } = await db.from('workspace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', user.id).single();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let query = db
    .from('conversation_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (eventType) query = query.eq('event_type', eventType);
  if (status)    query = query.eq('status', status);

  const { data: events, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Stats
  const { data: stats } = await db
    .from('conversation_events')
    .select('event_type')
    .eq('workspace_id', workspaceId);

  const counts: Record<string, number> = {};
  for (const row of (stats ?? []) as Array<{ event_type: string }>) {
    counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
  }

  return NextResponse.json({ events: events ?? [], counts });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, status, workspaceId } = await request.json() as { id: string; status: string; workspaceId: string };

  const db = createAdminClient() as any;
  const { data: member } = await db.from('workspace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', user.id).single();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await db.from('conversation_events').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

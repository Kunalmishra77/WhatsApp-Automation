import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!profile?.is_platform_admin) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return db;
}

// GET /api/admin/support-tickets?workspaceId=xxx&status=open
export async function GET(request: NextRequest) {
  try {
    const db = await assertAdmin();
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const status      = request.nextUrl.searchParams.get('status');

    let query = db
      .from('support_tickets')
      .select('*, workspaces(name, slug)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (workspaceId) query = query.eq('workspace_id', workspaceId);
    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tickets: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}

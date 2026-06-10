import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/admin/workspaces/:id/members
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { data, error } = await db
    .from('workspace_members')
    .select('id, role, is_online, created_at, profiles(id, full_name, email, avatar_url)')
    .eq('workspace_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}

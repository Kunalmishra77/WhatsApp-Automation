import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/admin/health-reports?limit=20
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '30'), 100);

  const { data, error } = await db
    .from('platform_health_reports')
    .select('*')
    .order('checked_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

// PATCH /api/admin/health-reports — mark error report resolved
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await request.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await db.from('platform_health_reports').update({
    has_errors: false,
    error_resolved_at: new Date().toISOString(),
  }).eq('id', id);

  return NextResponse.json({ success: true });
}

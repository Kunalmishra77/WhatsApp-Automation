import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  return profile?.is_platform_admin ? db : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await requirePlatformAdmin();
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data, error } = await db
    .from('workspaces')
    .select('settings, phone_number_id, waba_id, access_token')
    .eq('id', id)
    .single();
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    settings:        data?.settings ?? {},
    phone_number_id: data?.phone_number_id ?? '',
    waba_id:         data?.waba_id ?? '',
    has_token:       !!(data?.access_token),
  });
}

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/admin/workspace-token?secret=CRON_SECRET&name=VMS
// Returns access_token for a workspace by name (partial match).
// DELETE THIS FILE after use.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') ?? '';
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const name = searchParams.get('name') ?? '';
  const db = createAdminClient() as any;

  let q = db
    .from('workspaces')
    .select('id, name, phone_number_id, access_token, waba_id')
    .order('created_at', { ascending: false });

  if (name) {
    q = q.ilike('name', `%${name}%`);
  }

  const { data: workspaces, error } = await q.limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ workspaces });
}

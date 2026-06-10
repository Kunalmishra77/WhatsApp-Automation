import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const db = createAdminClient() as any;
  const { data: p } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!p?.is_platform_admin) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return db;
}

// PATCH /api/admin/support-tickets/:id — update status, admin_reply
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const db = await assertAdmin();
    const { id } = await params;
    const body = await request.json() as { status?: string; admin_reply?: string };

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status)      update.status      = body.status;
    if (body.admin_reply !== undefined) update.admin_reply = body.admin_reply;
    if (body.status === 'resolved') update.resolved_at = new Date().toISOString();

    const { error } = await db.from('support_tickets').update(update).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}

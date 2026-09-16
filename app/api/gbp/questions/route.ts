import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/gbp/questions?workspaceId=&locationId=&status=
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const locationId = sp.get('locationId');
    const status = sp.get('status');

    let q = db.from('gbp_questions')
      .select('id, location_id, question_id, author_name, text, create_time, answer_text, answer_status, ai_draft')
      .eq('workspace_id', workspaceId);
    if (locationId && locationId !== 'all') q = q.eq('location_id', locationId);
    if (status && status !== 'all') q = q.eq('answer_status', status);

    const { data, error } = await q.order('create_time', { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });

    return NextResponse.json({ questions: data ?? [] });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

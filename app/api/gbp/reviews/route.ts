import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/gbp/reviews?workspaceId=&locationId=&rating=&status=&page=
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const locationId = sp.get('locationId');
    const rating = sp.get('rating');
    const status = sp.get('status'); // none | draft | approved | posted
    const page = Math.max(0, parseInt(sp.get('page') ?? '0', 10) || 0);
    const pageSize = 30;

    let q = db.from('gbp_reviews')
      .select('id, location_id, review_id, reviewer_name, reviewer_photo_url, star_rating, comment, create_time, reply_comment, reply_status, ai_draft', { count: 'exact' })
      .eq('workspace_id', workspaceId);
    if (locationId && locationId !== 'all') q = q.eq('location_id', locationId);
    if (rating && rating !== 'all') q = q.eq('star_rating', parseInt(rating, 10));
    if (status && status !== 'all') q = q.eq('reply_status', status);

    const { data, count, error } = await q
      .order('create_time', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });

    return NextResponse.json({ reviews: data ?? [], count: count ?? 0, page, pageSize });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

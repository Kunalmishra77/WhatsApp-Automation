import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/gbp/posts?workspaceId=&locationId=
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const locationId = sp.get('locationId');
    let q = db.from('gbp_posts')
      .select('id, location_id, post_id, topic_type, summary, media_url, cta_type, cta_url, status, published_at, created_at')
      .eq('workspace_id', workspaceId);
    if (locationId && locationId !== 'all') q = q.eq('location_id', locationId);

    const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    return NextResponse.json({ posts: data ?? [] });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/gbp/posts  Body: { workspaceId, locationId, topicType, summary, mediaUrl?, ctaType?, ctaUrl? }
// Creates a DRAFT post (never auto-published).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId?: string; locationId?: string; topicType?: string;
      summary?: string; mediaUrl?: string; ctaType?: string; ctaUrl?: string;
    };
    if (!body.workspaceId || !body.locationId || !body.summary?.trim()) {
      return NextResponse.json({ error: 'workspaceId, locationId and summary required' }, { status: 400 });
    }
    const ctx = await requireWorkspacePermission(body.workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data, error } = await db.from('gbp_posts').insert({
      workspace_id: body.workspaceId,
      location_id: body.locationId,
      topic_type: body.topicType ?? 'STANDARD',
      summary: body.summary.trim(),
      media_url: body.mediaUrl ?? null,
      cta_type: body.ctaType ?? null,
      cta_url: body.ctaUrl ?? null,
      status: 'draft',
      created_by: ctx.userId,
    }).select().single();
    if (error) return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });

    return NextResponse.json({ post: data }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

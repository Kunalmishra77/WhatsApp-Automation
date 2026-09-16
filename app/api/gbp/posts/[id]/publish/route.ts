import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { getWorkspaceGbpAuth } from '@/lib/gbp-sync';
import { createLocalPost, type GbpLocalPost } from '@/lib/google-business';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// POST /api/gbp/posts/[id]/publish  Body: { workspaceId }
// Human-approved: publishes a draft post to Google.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: post } = await db
      .from('gbp_posts')
      .select('id, location_id, topic_type, summary, media_url, cta_type, cta_url, status')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    if (post.status === 'published') return NextResponse.json({ error: 'Already published' }, { status: 400 });

    const auth = await getWorkspaceGbpAuth(db, workspaceId);
    if (!auth) return NextResponse.json({ error: 'GBP not connected' }, { status: 400 });

    const payload: GbpLocalPost = {
      languageCode: 'en',
      summary: post.summary,
      topicType: post.topic_type,
      ...(post.cta_type && post.cta_url
        ? { callToAction: { actionType: post.cta_type, url: post.cta_url } }
        : {}),
      ...(post.media_url ? { media: [{ mediaFormat: 'PHOTO', sourceUrl: post.media_url }] } : {}),
    };

    const res = await createLocalPost(auth.accessToken, auth.accountId, post.location_id, payload);
    if (!res.ok) {
      await db.from('gbp_posts').update({ status: 'failed' }).eq('id', id).eq('workspace_id', workspaceId);
      return NextResponse.json({ error: `Google rejected the post: ${res.error}` }, { status: 502 });
    }

    await db.from('gbp_posts')
      .update({ status: 'published', post_id: res.data.name ?? null, published_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[GBP publish]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { getWorkspaceGbpAuth } from '@/lib/gbp-sync';
import { replyToReview } from '@/lib/google-business';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// POST /api/gbp/reviews/[id]/reply  Body: { workspaceId, comment }
// Human-approved: posts the reply to Google, then records it locally.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { workspaceId, comment } = await request.json() as { workspaceId?: string; comment?: string };
    if (!workspaceId || !comment?.trim()) {
      return NextResponse.json({ error: 'workspaceId and comment required' }, { status: 400 });
    }
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: review } = await db
      .from('gbp_reviews')
      .select('id, location_id, review_id')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

    const auth = await getWorkspaceGbpAuth(db, workspaceId);
    if (!auth) return NextResponse.json({ error: 'GBP not connected' }, { status: 400 });

    const res = await replyToReview(auth.accessToken, auth.accountId, review.location_id, review.review_id, comment.trim());
    if (!res.ok) return NextResponse.json({ error: `Google rejected the reply: ${res.error}` }, { status: 502 });

    await db.from('gbp_reviews')
      .update({ reply_comment: comment.trim(), reply_status: 'posted', reply_update_time: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[GBP review reply]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

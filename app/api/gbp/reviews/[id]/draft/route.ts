import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { callAI } from '@/lib/ai-client';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// POST /api/gbp/reviews/[id]/draft  Body: { workspaceId }
// Generate an AI-drafted reply for a review. Stored as a DRAFT — never posted.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: review } = await db
      .from('gbp_reviews')
      .select('id, reviewer_name, star_rating, comment')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

    const { data: ws } = await db.from('workspaces').select('name').eq('id', workspaceId).single();
    const businessName = ws?.name ?? 'our business';

    const draft = await callAI([
      {
        role: 'system',
        content: `You write short, warm, professional replies to Google Business reviews on behalf of "${businessName}". ` +
          `Thank the customer by name when available, address their point specifically, stay under 60 words, ` +
          `never be defensive, and for negative reviews apologize and invite them to make it right. ` +
          `Reply in the same language as the review. Output only the reply text.`,
      },
      {
        role: 'user',
        content: `Reviewer: ${review.reviewer_name ?? 'Customer'}\nRating: ${review.star_rating ?? '?'}/5\nReview: ${review.comment ?? '(no text)'}`,
      },
    ]);

    if (!draft) return NextResponse.json({ error: 'AI draft unavailable' }, { status: 502 });

    await db.from('gbp_reviews')
      .update({ ai_draft: draft, reply_status: 'draft' })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[GBP review draft]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

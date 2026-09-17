import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { callAI } from '@/lib/ai-client';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// POST /api/gbp/questions/[id]/draft  Body: { workspaceId }
// AI-drafts an answer to a GBP question. Stored as a DRAFT — never posted.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: question } = await db
      .from('gbp_questions')
      .select('id, text, author_name')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

    const { data: ws } = await db.from('workspaces').select('name').eq('id', workspaceId).single();
    const businessName = ws?.name ?? 'our business';

    const draft = await callAI([
      {
        role: 'system',
        content: `You answer questions asked on the Google Business Profile of "${businessName}". ` +
          `Give a helpful, accurate, friendly answer in under 60 words, in the same language as the question. ` +
          `If you cannot be certain of a specific detail (price, timing), keep it general and invite them to contact the business. ` +
          `Output only the answer text.`,
      },
      { role: 'user', content: `Question: ${question.text ?? '(no text)'}` },
    ]);

    if (!draft) return NextResponse.json({ error: 'AI draft unavailable' }, { status: 502 });

    await db.from('gbp_questions')
      .update({ ai_draft: draft, answer_status: 'draft' })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[GBP question draft]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

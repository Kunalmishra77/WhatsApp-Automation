import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { getWorkspaceGbpAuth } from '@/lib/gbp-sync';
import { answerQuestion } from '@/lib/google-business';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// POST /api/gbp/questions/[id]/answer  Body: { workspaceId, text }
// Human-approved: posts the answer to Google, then records it locally.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { workspaceId, text } = await request.json() as { workspaceId?: string; text?: string };
    if (!workspaceId || !text?.trim()) {
      return NextResponse.json({ error: 'workspaceId and text required' }, { status: 400 });
    }
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: question } = await db
      .from('gbp_questions')
      .select('id, location_id, question_id')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

    const auth = await getWorkspaceGbpAuth(db, workspaceId);
    if (!auth) return NextResponse.json({ error: 'GBP not connected' }, { status: 400 });

    const questionName = `locations/${question.location_id}/questions/${question.question_id}`;
    const res = await answerQuestion(auth.accessToken, questionName, text.trim());
    if (!res.ok) return NextResponse.json({ error: `Google rejected the answer: ${res.error}` }, { status: 502 });

    await db.from('gbp_questions')
      .update({ answer_text: text.trim(), answer_status: 'posted' })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[GBP answer]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

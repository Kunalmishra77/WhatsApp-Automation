import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { classifyLeadPipeline } from '@/lib/lead-classifier';

type Params = { params: Promise<{ id: string }> };

// POST /api/leads/[id]/score
// Manual re-score. Delegates to the single AI lead-classification engine
// (lib/lead-classifier.ts) so the manual button produces the SAME conversation-based
// score + temperature + explainability as the automatic scoring — no competing
// heuristic. Returns the freshly-computed { score }.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: leadId } = await params;
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const { data: lead } = await db
      .from('leads')
      .select('id, conversation_id')
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      .single();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (!lead.conversation_id) return NextResponse.json({ error: 'No conversation linked to score' }, { status: 400 });

    await classifyLeadPipeline({ conversationId: lead.conversation_id, workspaceId, leadId });

    const { data: scored } = await db.from('leads').select('ai_score, temperature').eq('id', leadId).eq('workspace_id', workspaceId).single();
    return NextResponse.json({ score: scored?.ai_score ?? null, temperature: scored?.temperature ?? null });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[LeadScore]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

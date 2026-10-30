import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { startFlowForConversation } from '@/lib/flow-engine';

export const runtime = 'nodejs';

// POST /api/flows/[id]/start   { conversationId }
//
// Runs this flow for one conversation, now. What a `manual` trigger means:
// nothing a customer sends starts it, so something has to.
//
// Two uses, and they are the reason it exists rather than being a convenience:
// an agent in the inbox sending someone down a booking flow, and another system
// doing it over the API after an event this platform never sees.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { conversationId } = await request.json() as { conversationId?: string };
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    const { data: flow } = await db
      .from('chatbot_flows')
      .select('id, workspace_id, name, is_active')
      .eq('id', id)
      .maybeSingle();
    if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });

    const workspaceId = flow.workspace_id as string;
    await requireWorkspacePermission(workspaceId, 'manage_templates');

    // An inactive flow stays inactive. Starting one by hand would make "off"
    // mean something different depending on who asked, and a half-built draft
    // is the most likely thing in that state.
    if (flow.is_active !== true) {
      return NextResponse.json(
        { error: 'This flow is switched off. Turn it on before starting it.' },
        { status: 409 },
      );
    }

    // The conversation must belong to the same workspace as the flow. Checked
    // here rather than trusted: the permission above is on the workspace, and
    // without this a caller could run their own flow against someone else's
    // conversation by id.
    const { data: conv } = await db
      .from('conversations')
      .select('id, workspace_id, contact_id, contacts(phone)')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const result = await startFlowForConversation(db, {
      flowId: id,
      workspaceId,
      conversationId,
      contactId: (conv.contact_id as string) ?? null,
      contactPhone: (conv.contacts as { phone?: string } | null)?.phone ?? '',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }

    return NextResponse.json({ started: true, sessionId: result.sessionId });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[FlowStart]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await params;

    const body = await request.json() as { agentId?: string | null };
    if (!('agentId' in body)) {
      return NextResponse.json({ error: 'Missing agentId field' }, { status: 400 });
    }
    const { agentId } = body;

    const supabase = createAdminClient();
    const db = supabase as any;

    // Fetch conversation to get workspaceId
    const { data: conversation, error: fetchError } = await db
      .from('conversations')
      .select('id, workspace_id, contact_id')
      .eq('id', conversationId)
      .single();

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Verify permission
    const authz = await requireWorkspacePermission(
      conversation.workspace_id,
      'handle_conversations',
    );

    // Validate agentId if provided
    if (agentId !== null && agentId !== undefined) {
      const { data: member, error: memberError } = await db
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', conversation.workspace_id)
        .eq('user_id', agentId)
        .single();

      if (memberError || !member) {
        return NextResponse.json({ error: 'Agent is not a member of this workspace' }, { status: 400 });
      }
    }

    // Determine new status
    const newStatus = agentId ? 'assigned' : 'open';

    // Update conversation
    const { data: updated, error: updateError } = await db
      .from('conversations')
      .update({
        assigned_agent_id: agentId ?? null,
        status: newStatus,
      })
      .eq('id', conversationId)
      .select(`*, contacts(id, name, phone, avatar_url)`)
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
    }

    // Create activity log
    await db.from('activities').insert({
      workspace_id: conversation.workspace_id,
      actor_id: authz.userId,
      entity_type: 'conversation',
      entity_id: conversationId,
      action: agentId ? 'assigned' : 'unassigned',
      metadata: {
        agent_id: agentId ?? null,
        previous_agent_id: conversation.assigned_agent_id ?? null,
      },
    });

    return NextResponse.json({ success: true, conversation: updated });
  } catch (error) {
    if (error instanceof AuthzError) {
      return authzResponse(error);
    }
    console.error('[Assign] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

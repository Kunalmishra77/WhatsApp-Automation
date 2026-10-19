import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermissionAny, authzResponse, AuthzError } from '@/lib/authz';
import { logActivity } from '@/lib/activity-log';

// DELETE /api/conversations/[id]
//
// Removes a conversation and its messages. The contact survives, and so does
// everything that reports on them — their lead record, its score and stage, and
// their campaign history — because deleting a chat full of spam should not punch
// holes in the client's reporting.
//
// Both of those tables reference conversations with NO ACTION, so the references
// are cleared first; a plain delete would simply fail.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const db = createAdminClient() as any;
    const { data: conversation } = await db
      .from('conversations')
      .select('id, workspace_id, contact_id, contact:contacts!contact_id(name, phone)')
      .eq('id', id)
      .maybeSingle();

    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Deleting customer history is irreversible, so it sits above the inbox: an
    // agent facing an abuser can block them, which already stops the messages.
    const auth = await requireWorkspacePermissionAny(
      conversation.workspace_id,
      ['manage_team', 'manage_workspace'],
    );

    const { count: messageCount } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', id);

    // Clear the NO ACTION references, keeping the rows themselves.
    await db.from('leads')
      .update({ conversation_id: null })
      .eq('conversation_id', id)
      .eq('workspace_id', conversation.workspace_id);

    await db.from('campaign_recipients')
      .update({ conversation_id: null })
      .eq('conversation_id', id);

    // Messages, CSAT responses, flow sessions and queued triggers cascade.
    const { error } = await db
      .from('conversations')
      .delete()
      .eq('id', id)
      .eq('workspace_id', conversation.workspace_id);

    if (error) throw new Error(error.message);

    const label = (conversation.contact?.name as string | null)
      ?? (conversation.contact?.phone as string | null)
      ?? null;

    await logActivity({
      workspaceId: conversation.workspace_id,
      actorId: auth.userId,
      action: 'conversation.deleted',
      entityType: 'conversation',
      entityId: id,
      entityLabel: label,
      metadata: { messages_deleted: messageCount ?? 0, contact_id: conversation.contact_id },
    });

    return NextResponse.json({ success: true, messagesDeleted: messageCount ?? 0 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Conversation delete]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

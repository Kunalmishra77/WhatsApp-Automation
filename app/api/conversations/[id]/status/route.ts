import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import type { ConversationStatus } from '@/types/database.types';

const VALID_STATUSES: ConversationStatus[] = ['open', 'resolved', 'pending', 'snoozed'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await params;

    const body = await request.json() as { status?: string };
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status as ConversationStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    const newStatus = status as ConversationStatus;
    const supabase = createAdminClient();
    const db = supabase as any;

    // Fetch conversation to get workspaceId
    const { data: conversation, error: fetchError } = await db
      .from('conversations')
      .select('id, workspace_id, status')
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

    // Build update payload
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'resolved') {
      patch.resolved_at = new Date().toISOString();
    } else if ((conversation.status as string) === 'resolved') {
      // Reopening a resolved conversation — clear resolved_at
      patch.resolved_at = null;
    }

    // Update conversation
    const { data: updated, error: updateError } = await db
      .from('conversations')
      .update(patch)
      .eq('id', conversationId)
      .select(`*, contacts(id, name, phone, avatar_url)`)
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Failed to update conversation status' }, { status: 500 });
    }

    // Create activity log
    await db.from('activities').insert({
      workspace_id: conversation.workspace_id,
      actor_id: authz.userId,
      entity_type: 'conversation',
      entity_id: conversationId,
      action: `status_changed`,
      metadata: {
        from_status: conversation.status,
        to_status: newStatus,
      },
    });

    return NextResponse.json({ success: true, conversation: updated });
  } catch (error) {
    if (error instanceof AuthzError) {
      return authzResponse(error);
    }
    console.error('[Status] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

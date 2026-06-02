import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/conversations/merge
// Body: { workspaceId, primaryId, secondaryId }
// Moves all messages from secondaryId into primaryId, then resolves secondaryId.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, primaryId, secondaryId } = await request.json() as {
      workspaceId?: string; primaryId?: string; secondaryId?: string;
    };

    if (!workspaceId || !primaryId || !secondaryId) {
      return NextResponse.json({ error: 'workspaceId, primaryId and secondaryId required' }, { status: 400 });
    }
    if (primaryId === secondaryId) {
      return NextResponse.json({ error: 'Cannot merge a conversation with itself' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    // Verify both conversations belong to this workspace
    const { data: primary } = await db
      .from('conversations')
      .select('id, last_message, last_message_at')
      .eq('id', primaryId)
      .eq('workspace_id', workspaceId)
      .single();

    const { data: secondary } = await db
      .from('conversations')
      .select('id')
      .eq('id', secondaryId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!primary) return NextResponse.json({ error: 'Primary conversation not found' }, { status: 404 });
    if (!secondary) return NextResponse.json({ error: 'Secondary conversation not found' }, { status: 404 });

    // Move all messages from secondary → primary
    await db
      .from('messages')
      .update({ conversation_id: primaryId })
      .eq('conversation_id', secondaryId)
      .eq('workspace_id', workspaceId);

    // Move notes if any
    await db
      .from('contact_notes')
      .update({ })
      .eq('workspace_id', workspaceId); // notes are per-contact, not per-conversation — nothing to move

    // Recalculate last_message on primary from all its messages (now includes moved ones)
    const { data: lastMsg } = await db
      .from('messages')
      .select('content, created_at')
      .eq('conversation_id', primaryId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastMsg) {
      await db
        .from('conversations')
        .update({ last_message: lastMsg.content, last_message_at: lastMsg.created_at })
        .eq('id', primaryId);
    }

    // Resolve the secondary conversation (soft merge)
    await db
      .from('conversations')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', secondaryId);

    return NextResponse.json({ success: true, primaryId });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

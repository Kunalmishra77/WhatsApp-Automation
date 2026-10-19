import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { logActivity } from '@/lib/activity-log';

// POST /api/conversations/[id]/block
// Body: { blocked: boolean, reason?: string }
//
// Blocks or unblocks the contact behind a conversation. There was no way to do
// this from the product at all: one contact sent a client 111 images, mostly
// explicit, and pausing the bot only stopped the replies — the messages kept
// arriving in the inbox.
//
// is_blocked and opted_out are set together because that pair is what silences a
// contact everywhere: the WhatsApp webhook discards their messages before they are
// stored, and campaigns skip them.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { blocked, reason } = await request.json() as { blocked?: boolean; reason?: string };
    if (typeof blocked !== 'boolean') {
      return NextResponse.json({ error: 'blocked (boolean) required' }, { status: 400 });
    }

    const db = createAdminClient() as any;
    const { data: conversation } = await db
      .from('conversations')
      .select('id, workspace_id, contact_id, contact:contacts!contact_id(name, phone)')
      .eq('id', id)
      .maybeSingle();

    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Anyone working the inbox can stop an abuser — waiting for an admin is not
    // a reasonable answer to someone sending explicit images.
    const auth = await requireWorkspacePermission(conversation.workspace_id, 'manage_contacts');

    const now = new Date().toISOString();
    await db
      .from('contacts')
      .update(blocked
        ? {
            is_blocked: true,
            opted_out: true,
            blocked_reason: reason?.trim() || 'Blocked from the inbox',
            blocked_at: now,
          }
        : {
            is_blocked: false,
            opted_out: false,
            blocked_reason: null,
            blocked_at: null,
            // Strikes are history and stay, so a repeat offender is still one
            // offence away from being blocked again.
          })
      .eq('id', conversation.contact_id)
      .eq('workspace_id', conversation.workspace_id);

    // Blocking also silences the bot on this chat, so nothing keeps replying to
    // messages that arrived before the block.
    if (blocked) {
      await db.from('conversations').update({ bot_paused: true }).eq('id', id);
    }

    const label = (conversation.contact?.name as string | null)
      ?? (conversation.contact?.phone as string | null)
      ?? null;

    await logActivity({
      workspaceId: conversation.workspace_id,
      actorId: auth.userId,
      action: blocked ? 'contact.blocked' : 'contact.unblocked',
      entityType: 'contact',
      entityId: conversation.contact_id,
      entityLabel: label,
      metadata: { reason: reason ?? null, conversation_id: id },
    });

    return NextResponse.json({ success: true, blocked });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Conversation block]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

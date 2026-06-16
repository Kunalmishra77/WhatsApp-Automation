import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: messageId } = await params;
  try {
    const body = await request.json().catch(() => ({})) as { note?: string };

    const supabase = createAdminClient();
    const { data: message, error: msgError } = await (supabase as any)
      .from('messages')
      .select('workspace_id, conversation_id, sender_type')
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    if (message.sender_type !== 'bot') {
      return NextResponse.json({ error: 'Only bot replies can be flagged' }, { status: 400 });
    }

    const ctx = await requireWorkspacePermission(message.workspace_id, 'handle_conversations');

    const { error } = await (supabase as any)
      .from('bot_reply_feedback')
      .upsert(
        {
          message_id: messageId,
          workspace_id: message.workspace_id,
          conversation_id: message.conversation_id,
          note: body.note?.trim() || null,
          marked_by: ctx.userId,
          marked_bad_at: new Date().toISOString(),
          resolved_at: null,
        },
        { onConflict: 'message_id' },
      );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Bot Reply Feedback]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: messageId } = await params;
  try {
    const supabase = createAdminClient();
    const { data: message } = await (supabase as any)
      .from('messages')
      .select('workspace_id')
      .eq('id', messageId)
      .single();

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    await requireWorkspacePermission(message.workspace_id, 'handle_conversations');

    const { error } = await (supabase as any)
      .from('bot_reply_feedback')
      .delete()
      .eq('message_id', messageId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Bot Reply Feedback]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

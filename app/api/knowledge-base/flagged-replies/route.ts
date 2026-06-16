import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const supabase = createAdminClient();
    const { data: flags, error } = await (supabase as any)
      .from('bot_reply_feedback')
      .select('id, message_id, conversation_id, note, marked_bad_at, resolved_at')
      .eq('workspace_id', workspaceId)
      .is('resolved_at', null)
      .order('marked_bad_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const messageIds = (flags ?? []).map((f: any) => f.message_id);
    let messagesById: Record<string, { content: string | null; created_at: string }> = {};
    if (messageIds.length > 0) {
      const { data: messages } = await (supabase as any)
        .from('messages')
        .select('id, content, created_at')
        .in('id', messageIds);
      messagesById = Object.fromEntries((messages ?? []).map((m: any) => [m.id, m]));
    }

    const results = (flags ?? []).map((f: any) => ({
      ...f,
      message_content: messagesById[f.message_id]?.content ?? null,
      message_created_at: messagesById[f.message_id]?.created_at ?? null,
    }));

    return NextResponse.json({ flags: results });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Flagged Replies]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

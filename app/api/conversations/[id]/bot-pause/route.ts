import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/conversations/[id]/bot-pause
// Body: { workspaceId, paused: boolean }
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id: conversationId } = await params;
    const { workspaceId, paused } = await request.json() as { workspaceId?: string; paused?: boolean };
    if (!workspaceId || paused === undefined) {
      return NextResponse.json({ error: 'workspaceId and paused required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('conversations')
      .update({ bot_paused: paused })
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .select('id, bot_paused')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

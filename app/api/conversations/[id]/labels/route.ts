import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// PATCH /api/conversations/[id]/labels — set labels array
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await params;
    const { labels } = await request.json() as { labels?: string[] };

    if (!Array.isArray(labels)) return NextResponse.json({ error: 'labels[] required' }, { status: 400 });

    const db = createAdminClient() as any;
    const { data: conv } = await db.from('conversations').select('workspace_id').eq('id', conversationId).single();
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await requireWorkspacePermission(conv.workspace_id, 'handle_conversations');

    const { error } = await db
      .from('conversations')
      .update({ labels })
      .eq('id', conversationId);

    if (error) throw error;
    return NextResponse.json({ success: true, labels });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

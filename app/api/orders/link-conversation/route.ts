import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/orders/link-conversation
// Body: { workspaceId, orderId, conversationId }
// Links an order to a conversation for revenue attribution
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, orderId, conversationId } = await request.json() as {
      workspaceId?: string; orderId?: string; conversationId?: string;
    };

    if (!workspaceId || !orderId || !conversationId) {
      return NextResponse.json({ error: 'workspaceId, orderId and conversationId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('orders')
      .update({ conversation_id: conversationId })
      .eq('id', orderId)
      .eq('workspace_id', workspaceId)
      .select('id, order_ref, total_amount, currency, conversation_id')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/orders/link-conversation?workspaceId=&conversationId=
// Returns orders linked to a conversation
export async function GET(request: NextRequest) {
  try {
    const workspaceId    = request.nextUrl.searchParams.get('workspaceId');
    const conversationId = request.nextUrl.searchParams.get('conversationId');
    if (!workspaceId || !conversationId) {
      return NextResponse.json({ error: 'workspaceId and conversationId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const { data } = await db
      .from('orders')
      .select('id, order_ref, status, total_amount, currency, created_at')
      .eq('workspace_id', workspaceId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    return NextResponse.json(data ?? []);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

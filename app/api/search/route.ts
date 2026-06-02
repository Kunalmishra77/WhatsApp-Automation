import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/search?q=&workspaceId=
export async function GET(request: NextRequest) {
  try {
    const q           = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    if (q.length < 2) return NextResponse.json({ contacts: [], conversations: [], messages: [] });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const pattern = `%${q}%`;

    // Search contacts by name or phone
    const { data: contacts } = await db
      .from('contacts')
      .select('id, name, phone, tags')
      .eq('workspace_id', workspaceId)
      .or(`name.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(6);

    // Search conversations by contact name (via join)
    const { data: convContacts } = await db
      .from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .or(`name.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(20);

    const contactIds = (convContacts ?? []).map((c: { id: string }) => c.id);

    let convRows: unknown[] = [];
    if (contactIds.length > 0) {
      const { data } = await db
        .from('conversations')
        .select('id, status, last_message_at, contacts(name, phone)')
        .eq('workspace_id', workspaceId)
        .in('contact_id', contactIds)
        .order('last_message_at', { ascending: false })
        .limit(5);
      convRows = data ?? [];
    }

    // Search messages by content
    const { data: messages } = await db
      .from('messages')
      .select('id, content, type, created_at, conversation_id, direction')
      .eq('workspace_id', workspaceId)
      .ilike('content', pattern)
      .not('content', 'is', null)
      .neq('content', '')
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      contacts:      contacts      ?? [],
      conversations: convRows,
      messages:      messages      ?? [],
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Search]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

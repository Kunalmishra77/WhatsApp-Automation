import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

type Params = { params: Promise<{ id: string }> };

function csvCell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

// GET /api/conversations/[id]/export?workspaceId= — download full message history as CSV
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: conversationId } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;

    const { data: conversation } = await db
      .from('conversations')
      .select('id, contacts(name, phone)')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const { data: messages, error } = await db
      .from('messages')
      .select('direction, sender_type, type, content, caption, media_url, media_filename, status, created_at')
      .eq('conversation_id', conversationId)
      .eq('workspace_id', workspaceId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const header = [
      'Date', 'Time', 'From', 'Type', 'Message', 'Media URL', 'Status',
    ].join(',');

    const rows = (messages ?? []).map((m: any) => {
      const created = new Date(m.created_at);
      const from = m.direction === 'inbound'
        ? 'Customer'
        : (m.type === 'internal_note' ? 'Internal Note' : 'Agent/Bot');
      const text = m.content || m.caption || '';
      return [
        created.toISOString().slice(0, 10),
        created.toISOString().slice(11, 19),
        from,
        m.type,
        text,
        m.media_url ?? '',
        m.status ?? '',
      ].map(csvCell).join(',');
    });

    const csv = [header, ...rows].join('\n');
    const contact = conversation.contacts as { name: string | null; phone: string } | null;
    const fileSafeName = (contact?.name ?? contact?.phone ?? 'conversation').replace(/[^a-z0-9]+/gi, '_');

    return new NextResponse('﻿' + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileSafeName}_conversation.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

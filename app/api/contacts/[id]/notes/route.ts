import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

type Params = { params: Promise<{ id: string }> };

// GET /api/contacts/[id]/notes?workspaceId=
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: contactId } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('contact_notes')
      .select('id, content, created_at, created_by, profiles:created_by(full_name, email)')
      .eq('contact_id', contactId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/contacts/[id]/notes
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: contactId } = await params;
    const { workspaceId, content } = await request.json() as { workspaceId?: string; content?: string };
    if (!workspaceId || !content?.trim()) {
      return NextResponse.json({ error: 'workspaceId and content required' }, { status: 400 });
    }

    const authz = await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('contact_notes')
      .insert({ contact_id: contactId, workspace_id: workspaceId, content: content.trim(), created_by: authz.userId })
      .select('id, content, created_at, created_by, profiles:created_by(full_name, email)')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/contacts/[id]/notes?noteId=&workspaceId=
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id: contactId } = await params;
    const noteId     = request.nextUrl.searchParams.get('noteId');
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!noteId || !workspaceId) {
      return NextResponse.json({ error: 'noteId and workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    await db
      .from('contact_notes')
      .delete()
      .eq('id', noteId)
      .eq('contact_id', contactId)
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

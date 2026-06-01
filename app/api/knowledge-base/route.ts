import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/knowledge-base?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('knowledge_base')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data ?? [] });
  } catch (error) {
    return authzResponse(error);
  }
}

// POST /api/knowledge-base — create entry
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, title, content, category = 'general' } = await request.json() as {
      workspaceId?: string;
      title?: string;
      content?: string;
      category?: string;
    };

    if (!workspaceId || !title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'workspaceId, title and content are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('knowledge_base')
      .insert({ workspace_id: workspaceId, title: title.trim(), content: content.trim(), category })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return authzResponse(error);
  }
}

// PATCH /api/knowledge-base — update entry
export async function PATCH(request: NextRequest) {
  try {
    const { id, workspaceId, title, content, category, isActive } = await request.json() as {
      id?: string;
      workspaceId?: string;
      title?: string;
      content?: string;
      category?: string;
      isActive?: boolean;
    };

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title.trim();
    if (content !== undefined) updates.content = content.trim();
    if (category !== undefined) updates.category = category;
    if (isActive !== undefined) updates.is_active = isActive;

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('knowledge_base')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
  } catch (error) {
    return authzResponse(error);
  }
}

// DELETE /api/knowledge-base?id=&workspaceId=
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { error } = await db
      .from('knowledge_base')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return authzResponse(error);
  }
}

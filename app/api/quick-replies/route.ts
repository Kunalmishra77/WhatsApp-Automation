import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/quick-replies?workspaceId=&q= (optional search)
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const q = request.nextUrl.searchParams.get('q')?.toLowerCase() ?? '';
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;
    let query = db
      .from('quick_replies')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('shortcut');

    if (q) {
      query = query.or(`shortcut.ilike.%${q}%,title.ilike.%${q}%,content.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ replies: data ?? [] });
  } catch (error) {
    return authzResponse(error);
  }
}

// POST — create
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, shortcut, title, content, category = 'general' } = await request.json() as {
      workspaceId?: string; shortcut?: string; title?: string; content?: string; category?: string;
    };

    if (!workspaceId || !shortcut?.trim() || !title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'workspaceId, shortcut, title and content required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const normalizedShortcut = shortcut.trim().startsWith('/')
      ? shortcut.trim()
      : `/${shortcut.trim()}`;

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('quick_replies')
      .insert({ workspace_id: workspaceId, shortcut: normalizedShortcut, title: title.trim(), content: content.trim(), category })
      .select().single();

    if (error?.code === '23505') return NextResponse.json({ error: `Shortcut "${normalizedShortcut}" already exists` }, { status: 409 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reply: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return authzResponse(error);
  }
}

// PATCH — update
export async function PATCH(request: NextRequest) {
  try {
    const { id, workspaceId, shortcut, title, content, category } = await request.json() as {
      id?: string; workspaceId?: string; shortcut?: string; title?: string; content?: string; category?: string;
    };
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const updates: Record<string, unknown> = {};
    if (shortcut !== undefined) {
      updates.shortcut = shortcut.trim().startsWith('/') ? shortcut.trim() : `/${shortcut.trim()}`;
    }
    if (title !== undefined) updates.title = title.trim();
    if (content !== undefined) updates.content = content.trim();
    if (category !== undefined) updates.category = category;

    const db = createAdminClient() as any;
    const { data, error } = await db.from('quick_replies').update(updates).eq('id', id).eq('workspace_id', workspaceId).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reply: data });
  } catch (error) {
    return authzResponse(error);
  }
}

// DELETE
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;
    await db.from('quick_replies').delete().eq('id', id).eq('workspace_id', workspaceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return authzResponse(error);
  }
}

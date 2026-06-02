import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/labels?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('workspace_labels')
      .select('id, name, color')
      .eq('workspace_id', workspaceId)
      .order('name');

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/labels — create label
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, name, color } = await request.json() as { workspaceId?: string; name?: string; color?: string };
    if (!workspaceId || !name?.trim()) return NextResponse.json({ error: 'workspaceId and name required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('workspace_labels')
      .insert({ workspace_id: workspaceId, name: name.trim(), color: color ?? 'gray' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Label already exists' }, { status: 409 });
      throw error;
    }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/labels?id=&workspaceId=
export async function DELETE(request: NextRequest) {
  try {
    const id          = request.nextUrl.searchParams.get('id');
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    await db.from('workspace_labels').delete().eq('id', id).eq('workspace_id', workspaceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

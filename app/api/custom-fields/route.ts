import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/custom-fields?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('custom_field_definitions')
      .select('id, name, label, field_type, options, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at');

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/custom-fields
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, name, label, field_type, options } =
      await request.json() as {
        workspaceId?: string; name?: string; label?: string;
        field_type?: string; options?: string[];
      };

    if (!workspaceId || !name?.trim() || !label?.trim()) {
      return NextResponse.json({ error: 'workspaceId, name and label required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    const slug = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const { data, error } = await db
      .from('custom_field_definitions')
      .insert({
        workspace_id: workspaceId,
        name: slug,
        label: label.trim(),
        field_type: field_type ?? 'text',
        options: options ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Field already exists' }, { status: 409 });
      throw error;
    }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/custom-fields?id=&workspaceId=
export async function DELETE(request: NextRequest) {
  try {
    const id          = request.nextUrl.searchParams.get('id');
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    await db.from('custom_field_definitions').delete().eq('id', id).eq('workspace_id', workspaceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

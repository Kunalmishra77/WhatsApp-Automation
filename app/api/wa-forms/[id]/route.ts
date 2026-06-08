import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const db = createAdminClient() as any;
    const { data: ex } = await db.from('wa_forms').select('workspace_id').eq('id', id).single();
    if (!ex) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await requireWorkspacePermission(ex.workspace_id as string, 'manage_settings');
    const { data, error } = await db.from('wa_forms').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ form: data });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;
    const { data: ex } = await db.from('wa_forms').select('workspace_id').eq('id', id).single();
    if (!ex) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await requireWorkspacePermission(ex.workspace_id as string, 'manage_settings');
    await db.from('wa_forms').delete().eq('id', id);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// PATCH /api/automation-triggers/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const db = createAdminClient() as any;
    const { data: existing } = await db.from('automation_triggers').select('workspace_id').eq('id', id).single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await requireWorkspacePermission(existing.workspace_id as string, 'manage_settings');
    const { data, error } = await db.from('automation_triggers')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select().single();
    if (error) throw error;
    return NextResponse.json({ trigger: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/automation-triggers/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;
    const { data: existing } = await db.from('automation_triggers').select('workspace_id').eq('id', id).single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await requireWorkspacePermission(existing.workspace_id as string, 'manage_settings');
    await db.from('automation_triggers').delete().eq('id', id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

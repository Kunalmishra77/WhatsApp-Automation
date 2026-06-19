import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// DELETE /api/templates/:id?workspaceId=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: templateId } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const db = createAdminClient() as any;

    // Verify template belongs to this workspace
    const { data: template } = await db
      .from('templates')
      .select('id')
      .eq('id', templateId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    // Unlink any campaigns referencing this template (FK constraint)
    await db
      .from('campaigns')
      .update({ template_id: null })
      .eq('template_id', templateId)
      .eq('workspace_id', workspaceId);

    // Now safe to delete
    const { error } = await db.from('templates').delete().eq('id', templateId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TemplateDelete]', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}

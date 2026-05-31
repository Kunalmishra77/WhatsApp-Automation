import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

async function getRuleWorkspaceId(ruleId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await (supabase as any)
    .from('inbox_rules')
    .select('workspace_id')
    .eq('id', ruleId)
    .single();
  return (data?.workspace_id as string) ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getRuleWorkspaceId(id);

    if (!workspaceId) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const body = await request.json() as {
      name?: string;
      is_active?: boolean;
      trigger_type?: string;
      trigger_value?: Record<string, unknown>;
      actions?: Array<{ type: string; value: string }>;
      priority?: number;
    };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name          !== undefined) patch.name          = body.name;
    if (body.is_active     !== undefined) patch.is_active     = body.is_active;
    if (body.trigger_type  !== undefined) patch.trigger_type  = body.trigger_type;
    if (body.trigger_value !== undefined) patch.trigger_value = body.trigger_value;
    if (body.actions       !== undefined) patch.actions       = body.actions;
    if (body.priority      !== undefined) patch.priority      = body.priority;

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('inbox_rules')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[InboxRules PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getRuleWorkspaceId(id);

    if (!workspaceId) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('inbox_rules')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[InboxRules DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

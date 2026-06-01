import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

async function getLeadWorkspaceId(leadId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await (supabase as any)
    .from('leads')
    .select('workspace_id')
    .eq('id', leadId)
    .single();
  return (data?.workspace_id as string) ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leadId } = await params;

    const workspaceId = await getLeadWorkspaceId(leadId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_leads');

    const body = await request.json() as {
      stage?: string;
      title?: string;
      value?: number | null;
      notes?: string | null;
      priority?: string;
      follow_up_at?: string | null;
      assigned_agent_id?: string | null;
    };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.stage             !== undefined) patch.stage             = body.stage;
    if (body.title             !== undefined) patch.title             = body.title;
    if (body.value             !== undefined) patch.value             = body.value;
    if (body.notes             !== undefined) patch.notes             = body.notes;
    if (body.priority          !== undefined) patch.priority          = body.priority;
    if (body.follow_up_at      !== undefined) patch.follow_up_at      = body.follow_up_at;
    if (body.assigned_agent_id !== undefined) patch.assigned_agent_id = body.assigned_agent_id;

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('leads')
      .update(patch)
      .eq('id', leadId)
      .select('*, contacts(name, phone, avatar_url)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Leads PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leadId } = await params;

    const workspaceId = await getLeadWorkspaceId(leadId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_leads');

    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('leads')
      .delete()
      .eq('id', leadId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Leads DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

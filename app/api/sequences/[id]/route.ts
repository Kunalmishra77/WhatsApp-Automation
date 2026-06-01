import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

async function getSequenceWorkspaceId(sequenceId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await (supabase as any)
    .from('follow_up_sequences')
    .select('workspace_id')
    .eq('id', sequenceId)
    .single();
  return (data?.workspace_id as string) ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sequenceId } = await params;

    const workspaceId = await getSequenceWorkspaceId(sequenceId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_contacts');

    const body = await request.json() as {
      name?: string;
      is_active?: boolean;
      steps?: Array<{ delay_hours: number; message: string }>;
    };

    const patch: Record<string, unknown> = {};
    if (body.name      !== undefined) patch.name      = body.name;
    if (body.is_active !== undefined) patch.is_active = body.is_active;
    if (body.steps     !== undefined) patch.steps     = body.steps;

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('follow_up_sequences')
      .update(patch)
      .eq('id', sequenceId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sequence: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Sequences PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sequenceId } = await params;

    const workspaceId = await getSequenceWorkspaceId(sequenceId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_contacts');

    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('follow_up_sequences')
      .delete()
      .eq('id', sequenceId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Sequences DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

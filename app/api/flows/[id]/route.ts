import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { flowSaveWarnings } from '@/lib/flow-save-warnings';

async function getFlowWorkspaceId(flowId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await (supabase as any)
    .from('chatbot_flows')
    .select('workspace_id')
    .eq('id', flowId)
    .single();
  return (data?.workspace_id as string) ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getFlowWorkspaceId(id);

    if (!workspaceId) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('chatbot_flows')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ flow: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flows GET/:id]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getFlowWorkspaceId(id);

    if (!workspaceId) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
    }

    const ctx = await requireWorkspacePermission(workspaceId, 'manage_templates');

    const body = await request.json() as Record<string, unknown>;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowedFields = ['name', 'description', 'is_active', 'trigger_type', 'trigger_value', 'nodes', 'edges'];
    for (const field of allowedFields) {
      if (body[field] !== undefined) patch[field] = body[field];
    }

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('chatbot_flows')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Two things about the save that has just happened, in one wait.
    //
    // The version was already written by a trigger on the table (migration
    // 141), which is what catches changes made by SQL too. Only the name on it
    // comes from here: the routes use the admin client, so the trigger has no
    // auth.uid() to read. Awaited rather than fired and forgotten — a promise
    // left running past the response is not guaranteed to finish on a
    // serverless runtime, and an attribution that usually works is worse than
    // one that always does.
    //
    // The warnings are checks the pure validator cannot make, run on the saved
    // row rather than the body: `is_active`, the trigger and the nodes are
    // exactly the fields a PATCH may leave untouched, so the body alone cannot
    // answer "does this flow now collide with another?".
    const [attribution, warnings] = await Promise.all([
      (supabase as any).rpc('flow_version_attribute', {
        p_flow: id, p_workspace: workspaceId, p_user: ctx.userId,
      }),
      flowSaveWarnings(supabase, workspaceId, data),
    ]);

    // Never fails the save: the version exists either way, just unattributed.
    if (attribution?.error) {
      console.error('[Flows PATCH] version attribution failed:', attribution.error.message);
    }

    return NextResponse.json({ flow: data, warnings });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flows PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getFlowWorkspaceId(id);

    if (!workspaceId) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('chatbot_flows')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flows DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import type { FlowNode, FlowEdge } from '@/modules/flows/types';

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await (supabase as any)
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  return (member?.workspace_id as string) ?? null;
}

const DEFAULT_START_NODE: FlowNode = {
  id: 'start-1',
  type: 'start',
  position: { x: 250, y: 50 },
  data: { label: 'Start', triggerType: 'keyword', triggerValue: '' },
};

export async function GET(_request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('chatbot_flows')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ flows: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flows GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const body = await request.json() as { name?: string; description?: string };

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const defaultNodes: FlowNode[] = [DEFAULT_START_NODE];
    const defaultEdges: FlowEdge[] = [];

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('chatbot_flows')
      .insert({
        workspace_id:  workspaceId,
        name:          body.name,
        description:   body.description ?? null,
        is_active:     false,
        trigger_type:  'keyword',
        trigger_value: null,
        nodes:         defaultNodes,
        edges:         defaultEdges,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ flow: data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flows POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

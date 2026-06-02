import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import type { FlowNode, FlowEdge } from '@/modules/flows/types';

const DEFAULT_START_NODE: FlowNode = {
  id: 'start-1',
  type: 'start',
  position: { x: 250, y: 50 },
  data: { label: 'Start', triggerType: 'keyword', triggerValue: '' },
};

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
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
    const body = await request.json() as {
      name?: string;
      description?: string;
      workspaceId?: string;
      trigger_type?: string;
      trigger_value?: string | null;
      nodes?: FlowNode[];
      edges?: FlowEdge[];
    };

    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const nodes = body.nodes ?? [DEFAULT_START_NODE];
    const edges = body.edges ?? [];

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('chatbot_flows')
      .insert({
        workspace_id:  workspaceId,
        name:          body.name,
        description:   body.description ?? null,
        is_active:     false,
        trigger_type:  body.trigger_type ?? 'keyword',
        trigger_value: body.trigger_value ?? null,
        nodes,
        edges,
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

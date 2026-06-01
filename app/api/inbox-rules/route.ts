import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('inbox_rules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('priority', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[InboxRules GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId: string;
      name: string;
      trigger_type: string;
      trigger_value?: Record<string, unknown>;
      actions?: Array<{ type: string; value: string }>;
      priority?: number;
      is_active?: boolean;
    };

    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    if (!body.name || !body.trigger_type) {
      return NextResponse.json({ error: 'name and trigger_type are required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('inbox_rules')
      .insert({
        workspace_id:  workspaceId,
        name:          body.name,
        trigger_type:  body.trigger_type,
        trigger_value: body.trigger_value ?? {},
        actions:       body.actions ?? [],
        priority:      body.priority ?? 0,
        is_active:     body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[InboxRules POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

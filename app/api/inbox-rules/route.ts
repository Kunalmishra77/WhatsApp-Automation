import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

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

export async function GET(_request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
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
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const body = await request.json() as {
      name: string;
      trigger_type: string;
      trigger_value?: Record<string, unknown>;
      actions?: Array<{ type: string; value: string }>;
      priority?: number;
      is_active?: boolean;
    };

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

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_contacts');

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('follow_up_sequences')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sequences: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Sequences GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId?: string;
      name?: string;
      steps?: Array<{ delay_hours: number; message: string }>;
    };

    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_contacts');

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('follow_up_sequences')
      .insert({
        workspace_id: workspaceId,
        name: body.name,
        steps: body.steps ?? [],
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sequence: data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Sequences POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

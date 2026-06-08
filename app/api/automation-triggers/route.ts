import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/automation-triggers?workspaceId=xxx
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('automation_triggers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at');
    if (error) throw error;
    return NextResponse.json({ triggers: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/automation-triggers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId: string;
      name: string;
      trigger_type: 'birthday' | 're_engagement' | 'abandoned_cart';
      message: string;
      config?: Record<string, unknown>;
      audience_filter?: Record<string, unknown>;
    };
    if (!body.workspaceId || !body.name || !body.trigger_type || !body.message) {
      return NextResponse.json({ error: 'workspaceId, name, trigger_type, message required' }, { status: 400 });
    }
    await requireWorkspacePermission(body.workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;
    const { data, error } = await db.from('automation_triggers').insert({
      workspace_id:    body.workspaceId,
      name:            body.name,
      trigger_type:    body.trigger_type,
      message:         body.message,
      config:          body.config ?? {},
      audience_filter: body.audience_filter ?? {},
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ trigger: data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

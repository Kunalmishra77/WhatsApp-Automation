import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/time-trigger-config?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    const { data } = await db
      .from('workspace_time_trigger_config')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    return NextResponse.json(data ?? {
      idle_close_enabled: false,
      idle_close_hours:   24,
      idle_message:       null,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/time-trigger-config — upsert config
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, idle_close_enabled, idle_close_hours, idle_message } =
      await request.json() as {
        workspaceId?: string;
        idle_close_enabled?: boolean;
        idle_close_hours?: number;
        idle_message?: string;
      };

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('workspace_time_trigger_config')
      .upsert({
        workspace_id:       workspaceId,
        idle_close_enabled: idle_close_enabled ?? false,
        idle_close_hours:   idle_close_hours   ?? 24,
        idle_message:       idle_message?.trim() || null,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'workspace_id' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

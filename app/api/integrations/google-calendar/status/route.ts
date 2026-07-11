import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

// GET /api/integrations/google-calendar/status?workspaceId=WORKSPACE_ID
// Returns only whether the workspace has a stored refresh token — never the
// token itself — so connection state can be read on the client safely.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: ws } = await db
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single();

    const settings = (ws?.settings ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      connected: !!settings.google_calendar_refresh_token,
      connectedAt: (settings.google_calendar_connected_at as string) ?? null,
    });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to read Google Calendar status' }, { status: 500 });
  }
}

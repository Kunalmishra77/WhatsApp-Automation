import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const s = { ...(ws?.settings ?? {}) } as Record<string, unknown>;
    delete s.google_calendar_refresh_token;
    delete s.google_calendar_id;
    delete s.google_calendar_connected_at;

    await db.from('workspaces').update({ settings: s }).eq('id', workspaceId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}

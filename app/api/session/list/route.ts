import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { createAdminClient } from '@/services/supabase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/session';
import { getUser } from '@/modules/auth/services/auth.service';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createAdminClient() as any;
    const { data: sessions, error } = await db
      .from('workspace_sessions')
      .select('id, user_agent, ip_address, created_at, last_seen_at, session_token')
      .eq('workspace_id', workspaceId)
      .eq('user_id',      user.id)
      .gt('expires_at',   new Date().toISOString())
      .order('last_seen_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const currentToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    return NextResponse.json({
      sessions: (sessions ?? []).map((s: any) => ({
        id:           s.id,
        user_agent:   s.user_agent,
        ip_address:   s.ip_address,
        created_at:   s.created_at,
        last_seen_at: s.last_seen_at,
        isCurrent:    s.session_token === currentToken,
      })),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

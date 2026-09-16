import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/integrations/gbp/status?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: conn } = await db
      .from('gbp_connections')
      .select('email, status, connected_at, last_synced_at, google_account_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!conn) return NextResponse.json({ connected: false });

    const { count } = await db
      .from('gbp_locations')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    return NextResponse.json({
      connected: conn.status === 'connected',
      email: conn.email,
      status: conn.status,
      connected_at: conn.connected_at,
      last_synced_at: conn.last_synced_at,
      locations: count ?? 0,
    });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to fetch GBP status' }, { status: 500 });
  }
}

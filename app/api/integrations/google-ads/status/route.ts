import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/integrations/google-ads/status?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: conn } = await db
      .from('google_ads_connections')
      .select('email, status, customer_id, connected_at, last_synced_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!conn) return NextResponse.json({ connected: false });
    return NextResponse.json({
      connected: conn.status === 'connected',
      email: conn.email,
      status: conn.status,
      customer_id: conn.customer_id,
      connected_at: conn.connected_at,
      last_synced_at: conn.last_synced_at,
    });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to fetch Google Ads status' }, { status: 500 });
  }
}

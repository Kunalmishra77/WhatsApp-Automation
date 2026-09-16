import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/gbp/locations?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('gbp_locations')
      .select('id, location_id, title, address, primary_phone, website_uri, is_active')
      .eq('workspace_id', workspaceId)
      .order('title', { ascending: true });
    if (error) return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 });

    return NextResponse.json({ locations: data ?? [] });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

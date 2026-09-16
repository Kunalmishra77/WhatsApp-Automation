import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const runtime = 'nodejs';

// POST /api/integrations/gbp/disconnect  Body: { workspaceId }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    // Removing the connection cascades to gbp_locations; reviews/questions/posts/
    // insights are kept as historical records (they carry no live token).
    await db.from('gbp_connections').delete().eq('workspace_id', workspaceId);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to disconnect GBP' }, { status: 500 });
  }
}

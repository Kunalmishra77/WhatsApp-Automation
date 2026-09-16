import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { syncWorkspaceGbp } from '@/lib/gbp-sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/integrations/gbp/sync  Body: { workspaceId } — manual re-sync.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const result = await syncWorkspaceGbp(db, workspaceId);
    if (!result.ok) return NextResponse.json({ error: result.error ?? 'sync_failed' }, { status: 400 });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to sync GBP' }, { status: 500 });
  }
}

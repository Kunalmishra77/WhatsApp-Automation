import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { syncWorkspaceAds } from '@/lib/google-ads-sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/integrations/google-ads/sync  Body: { workspaceId }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const result = await syncWorkspaceAds(db, workspaceId);
    if (!result.ok) return NextResponse.json({ error: result.error ?? 'sync_failed' }, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to sync Google Ads' }, { status: 500 });
  }
}

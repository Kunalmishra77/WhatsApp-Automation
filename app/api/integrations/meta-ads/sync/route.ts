import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { syncWorkspaceMetaAds } from '@/lib/meta-ads-sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/integrations/meta-ads/sync  Body: { workspaceId }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const result = await syncWorkspaceMetaAds(db, workspaceId);
    if (!result.ok) {
      const msg = result.error === 'not_configured'
        ? 'Add your Meta ad account ID in Settings first.'
        : `Meta Ads sync failed: ${result.error}`;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

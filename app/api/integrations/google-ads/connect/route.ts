import { type NextRequest, NextResponse } from 'next/server';
import { getAdsOAuthUrl } from '@/lib/google-ads';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

// GET /api/integrations/google-ads/connect?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    return NextResponse.redirect(getAdsOAuthUrl(workspaceId));
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to initiate Google Ads OAuth' }, { status: 500 });
  }
}

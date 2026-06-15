import { type NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthUrl } from '@/lib/google-calendar';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const url = getGoogleOAuthUrl(workspaceId);
    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to initiate Google OAuth' }, { status: 500 });
  }
}

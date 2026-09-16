import { type NextRequest, NextResponse } from 'next/server';
import { getGbpOAuthUrl } from '@/lib/google-business';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

// GET /api/integrations/gbp/connect?workspaceId= — start the GBP OAuth flow.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    return NextResponse.redirect(getGbpOAuthUrl(workspaceId));
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Failed to initiate Google Business OAuth' }, { status: 500 });
  }
}

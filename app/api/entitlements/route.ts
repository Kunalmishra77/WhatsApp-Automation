import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { getWorkspaceEntitlements } from '@/lib/entitlements';

export const runtime = 'nodejs';

// GET /api/entitlements?workspaceId=...
// What the current workspace can use: modules, trial state, caps. Any member can read.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;
    const ent = await getWorkspaceEntitlements(db, workspaceId);
    return NextResponse.json(ent);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Entitlements GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
